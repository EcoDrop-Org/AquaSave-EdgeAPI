# AquaSave Edge Service

Puente de protocolo entre el firmware del ESP32 (MQTT) y el backend AquaSave
(REST HTTP).

## Arquitectura

```
ESP32 ──MQTT──► Mosquitto Broker ──MQTT──► Edge Service ──HTTP──► Backend AquaSave
      ◄─MQTT── (open-valve / close-valve) ◄── polling de comandos pendientes ──┘
```

El edge descubre los dispositivos automáticamente por los tópicos MQTT en los
que publican; no necesita configuración por dispositivo.

## Estructura DDD

```
src/
├── domain/
│   ├── MqttTopics.ts               # Registro de tópicos (única fuente de verdad)
│   └── models/
│       └── DeviceRegistry.ts       # Dispositivos vistos por MQTT
├── application/
│   ├── handlers/
│   │   ├── TelemetryEventHandler.ts  # telemetry → POST /api/edge/devices/{id}/telemetry
│   │   └── StatusEventHandler.ts     # status → POST /api/edge/devices/{id}/status
│   └── services/
│       └── CommandDispatchService.ts # polling de comandos + publicación MQTT + acks
└── infrastructure/
    ├── mqtt/
    │   └── MqttBrokerClient.ts     # Cliente Mosquitto (con comodines +)
    └── http/
        └── AquaSaveHttpClient.ts   # Cliente REST (axios) del backend
```

## Mapeo MQTT ↔ REST

| Tópico MQTT | Disparador | Llamada REST |
|---|---|---|
| `aquasave/devices/{id}/telemetry` | ESP32 publica lecturas cada 5 s | `POST /api/edge/devices/{id}/telemetry` |
| `aquasave/devices/{id}/status` | Conexión / Last Will del ESP32 | `POST /api/edge/devices/{id}/status` |
| `aquasave/devices/{id}/commands` ← | Comando pendiente en el backend | `GET /api/edge/devices/{id}/commands/pending` (polling) |
| `aquasave/devices/{id}/commands/ack` | ESP32 confirma un comando | `POST /api/edge/devices/{id}/commands/{commandId}/ack` |

## Puesta en marcha

```bash
npm install
cp .env.example .env
# Editar .env: URL del broker, URL del backend y EDGE_API_KEY
npm run dev
```

Variables de entorno:

| Variable | Default | Descripción |
|---|---|---|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | Broker Mosquitto |
| `BACKEND_BASE_URL` | `http://localhost:3000` | Backend AquaSave |
| `EDGE_API_KEY` | _(vacío)_ | Debe coincidir con `EDGE_API_KEY` del backend |
| `COMMAND_POLL_INTERVAL_MS` | `3000` | Frecuencia del polling de comandos |

## Con Docker (Mosquitto + Edge)

```bash
docker compose up --build
```

Levanta Mosquitto en el puerto 1883 y el edge apuntando al backend local
(`http://host.docker.internal:3000`). Para usar el backend desplegado,
cambiar `BACKEND_BASE_URL` en `docker-compose.yml`.

## Flujo completo de un riego manual

1. El usuario pulsa "Iniciar riego" en la app → `POST /api/irrigation/devices/{id}/start`.
2. El backend encola `open-valve` y crea el evento de riego `manual`.
3. El edge, en su siguiente polling, publica el comando en `aquasave/devices/{id}/commands`.
4. El ESP32 enciende la bomba y confirma por `.../commands/ack`.
5. El edge marca el comando como `acknowledged` en el backend.
6. La telemetría siguiente (`pumpOn: true`) mantiene el estado consistente.
