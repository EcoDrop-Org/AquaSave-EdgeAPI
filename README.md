# AquaSave Edge Service

Puente de protocolo entre el firmware del ESP32 por MQTT y el backend AquaSave
por HTTP.

## Arquitectura

```text
ESP32 --MQTT--> HiveMQ Cloud --MQTT--> Edge Service --HTTP--> Backend AquaSave
      <--MQTT-- comandos             <--HTTP-- polling de comandos pendientes
```

El Edge Service descubre los dispositivos automaticamente por los topicos MQTT
en los que publican; no necesita configuracion por dispositivo.

## Mapeo MQTT a REST

| Topico MQTT | Disparador | Llamada REST |
|---|---|---|
| `aquasave/devices/{id}/telemetry` | ESP32 publica lecturas cada 5 s | `POST /api/edge/devices/{id}/telemetry` |
| `aquasave/devices/{id}/status` | Conexion / Last Will del ESP32 | `POST /api/edge/devices/{id}/status` |
| `aquasave/devices/{id}/commands` | Comando pendiente en el backend | `GET /api/edge/devices/{id}/commands/pending` y publicacion MQTT |
| `aquasave/devices/{id}/commands/ack` | ESP32 confirma un comando | `POST /api/edge/devices/{id}/commands/{commandId}/ack` |

## Variables de entorno

| Variable | Ejemplo | Descripcion |
|---|---|---|
| `MQTT_BROKER_URL` | `mqtts://109a1a97e0814454afa8d22b818e2da5.s1.eu.hivemq.cloud:8883` | Broker MQTT. HiveMQ Cloud usa `mqtts` y puerto `8883` |
| `MQTT_USERNAME` | `aquasave-edge` | Usuario MQTT de HiveMQ Cloud |
| `MQTT_PASSWORD` | `...` | Password MQTT de HiveMQ Cloud |
| `MQTT_CLIENT_ID` | `aquasave-edge-service` | Client ID MQTT del Edge Service |
| `MQTT_REJECT_UNAUTHORIZED` | `true` | Validacion TLS. Omitir o dejar `true` en Render |
| `BACKEND_BASE_URL` | `https://aquasave-backend.onrender.com` | URL del backend AquaSave |
| `EDGE_API_KEY` | vacio | Debe coincidir con el backend si este define `EDGE_API_KEY` |
| `COMMAND_POLL_INTERVAL_MS` | `3000` | Frecuencia del polling de comandos |

## HiveMQ Cloud configurado

Cluster usado para AquaSave:

```text
Host: 109a1a97e0814454afa8d22b818e2da5.s1.eu.hivemq.cloud
MQTT TLS port: 8883
WebSocket TLS port: 8884
Username: aquasave-edge
```

La password real esta en el archivo local `.env` y debe configurarse como
variable secreta en Render. No conviene publicarla en el repositorio.

## Ejecucion local

```bash
npm install
copy .env.example .env
npm run dev
```

Si usas el `.env` local incluido en tu maquina, el Edge Service ya apunta a
HiveMQ Cloud y al backend de Render.

## Docker local

```bash
docker compose up --build
```

Este `docker-compose.yml` levanta solo el Edge Service. No levanta Mosquitto,
porque HiveMQ Cloud reemplaza al broker local.

## Deploy en Render como Background Worker

Crear un servicio en Render de tipo **Background Worker** con:

```text
Build Command: npm install && npm run build
Start Command: npm start
```

Variables de entorno para Render:

```env
MQTT_BROKER_URL=mqtts://109a1a97e0814454afa8d22b818e2da5.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=aquasave-edge
MQTT_PASSWORD=poner_la_password_de_hivemq
MQTT_CLIENT_ID=aquasave-edge-service
BACKEND_BASE_URL=https://aquasave-backend.onrender.com
EDGE_API_KEY=
COMMAND_POLL_INTERVAL_MS=3000
```

No crear un Web Service para este proyecto: el EdgeAPI no expone HTTP publico.
Debe quedarse corriendo como proceso de fondo conectado a HiveMQ.

## Flujo de riego manual

1. El usuario pulsa "Iniciar riego" en la app.
2. El backend encola `open-valve`.
3. El Edge Service consulta comandos pendientes del backend.
4. El Edge Service publica el comando en HiveMQ Cloud.
5. El ESP32 recibe el comando, enciende la bomba y publica un ack.
6. El Edge Service recibe el ack y confirma el comando al backend.
