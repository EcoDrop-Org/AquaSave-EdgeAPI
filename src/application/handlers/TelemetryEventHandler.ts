import { MqttTopics } from '../../domain/MqttTopics';
import type { DeviceRegistry } from '../../domain/models/DeviceRegistry';
import type {
  AquaSaveHttpClient,
  TelemetryPayload,
} from '../../infrastructure/http/AquaSaveHttpClient';

/**
 * Aplicacion: telemetria del ESP32 (MQTT) -> backend (REST).
 *
 * Payload esperado (publicado por AquaSave.ino cada 5 s):
 *   { soilMoisturePct, temperatureC?, humidityPct?, pumpOn, flowRateLMin }
 */
export class TelemetryEventHandler {
  constructor(
    private readonly http: AquaSaveHttpClient,
    private readonly registry: DeviceRegistry,
  ) {}

  async handle(topic: string, payload: string): Promise<void> {
    const deviceId = MqttTopics.deviceIdFrom(topic);
    if (!deviceId) {
      console.warn(`[Telemetry] Topico invalido: ${topic}`);
      return;
    }

    let data: TelemetryPayload;
    try {
      data = JSON.parse(payload) as TelemetryPayload;
    } catch {
      console.warn(`[Telemetry] Payload ilegible de ${deviceId}: ${payload}`);
      return;
    }

    if (typeof data.soilMoisturePct !== 'number') {
      console.warn(`[Telemetry] Falta soilMoisturePct (${deviceId}), ignorado.`);
      return;
    }

    this.registry.markSeen(deviceId);

    try {
      await this.http.postTelemetry(deviceId, {
        soilMoisturePct: data.soilMoisturePct,
        temperatureC: data.temperatureC,
        humidityPct: data.humidityPct,
        pumpOn: data.pumpOn,
        flowRateLMin: data.flowRateLMin,
        batteryPct: data.batteryPct,
        recordedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(
        `[Telemetry] Error enviando telemetria de ${deviceId}:`,
        errorMessage(err),
      );
    }
  }
}

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
