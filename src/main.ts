/**
 * AquaSave Edge Service — punto de entrada
 *
 * Puente de protocolo entre el firmware ESP32 (MQTT) y el backend
 * AquaSave (REST HTTP):
 *
 *   ESP32 ──MQTT──► Mosquitto ──► Edge Service ──HTTP──► Backend AquaSave
 *         ◄─MQTT── (comandos)  ◄── polling de comandos pendientes ──┘
 *
 * Capas (DDD):
 *   Infraestructura → Aplicacion → Dominio
 */
import 'dotenv/config';

import { MqttBrokerClient } from './infrastructure/mqtt/MqttBrokerClient';
import { AquaSaveHttpClient } from './infrastructure/http/AquaSaveHttpClient';
import { DeviceRegistry } from './domain/models/DeviceRegistry';
import { MqttTopics } from './domain/MqttTopics';
import { TelemetryEventHandler } from './application/handlers/TelemetryEventHandler';
import { StatusEventHandler } from './application/handlers/StatusEventHandler';
import { CommandDispatchService } from './application/services/CommandDispatchService';

const MQTT_BROKER_URL =
  process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID?.trim() || undefined;
const MQTT_USERNAME = process.env.MQTT_USERNAME?.trim() || undefined;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD?.trim() || undefined;
const MQTT_REJECT_UNAUTHORIZED =
  process.env.MQTT_REJECT_UNAUTHORIZED?.trim().toLowerCase() === 'false'
    ? false
    : undefined;
const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ?? 'http://localhost:3000';
const EDGE_API_KEY = process.env.EDGE_API_KEY?.trim() || undefined;
const COMMAND_POLL_INTERVAL_MS = Number(
  process.env.COMMAND_POLL_INTERVAL_MS ?? 3000,
);

async function main() {
  console.log('[EdgeService] Iniciando AquaSave Edge Service...');
  console.log(`[EdgeService] Backend: ${BACKEND_BASE_URL}`);
  console.log(`[EdgeService] MQTT broker: ${MQTT_BROKER_URL}`);

  // ── Infraestructura ───────────────────────────────────────────────
  const httpClient = new AquaSaveHttpClient(BACKEND_BASE_URL, EDGE_API_KEY);
  const mqttClient = new MqttBrokerClient(MQTT_BROKER_URL, {
    clientId: MQTT_CLIENT_ID,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    rejectUnauthorized: MQTT_REJECT_UNAUTHORIZED,
  });

  // ── Dominio ───────────────────────────────────────────────────────
  const registry = new DeviceRegistry();

  // ── Aplicacion ────────────────────────────────────────────────────
  const telemetryHandler = new TelemetryEventHandler(httpClient, registry);
  const statusHandler = new StatusEventHandler(httpClient, registry);
  const commandService = new CommandDispatchService(
    httpClient,
    mqttClient,
    registry,
  );

  // ── Conectar MQTT y suscribirse ───────────────────────────────────
  await mqttClient.connect();

  mqttClient.subscribe(MqttTopics.TELEMETRY_WILDCARD, (topic, payload) => {
    void telemetryHandler.handle(topic, payload);
  });

  mqttClient.subscribe(MqttTopics.STATUS_WILDCARD, (topic, payload) => {
    void statusHandler.handle(topic, payload);
  });

  mqttClient.subscribe(MqttTopics.COMMAND_ACK_WILDCARD, (topic, payload) => {
    void commandService.onDeviceAck(topic, payload);
  });

  // ── Polling de comandos pendientes ────────────────────────────────
  commandService.start(COMMAND_POLL_INTERVAL_MS);

  console.log('[EdgeService] Listo. Escuchando topicos MQTT.');
}

main().catch((err) => {
  console.error('[EdgeService] Error fatal:', err);
  process.exit(1);
});
