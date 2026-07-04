import { MqttTopics } from '../../domain/MqttTopics';
import type { DeviceRegistry } from '../../domain/models/DeviceRegistry';
import type {
  AquaSaveHttpClient,
  DeviceStatusPayload,
} from '../../infrastructure/http/AquaSaveHttpClient';

/**
 * Aplicacion: estado del dispositivo (MQTT retained + Last Will) -> backend.
 *
 * El ESP32 publica { status: "online", firmwareVersion } al conectar y el
 * broker publica { status: "offline" } (Last Will) si pierde la conexion.
 */
export class StatusEventHandler {
  constructor(
    private readonly http: AquaSaveHttpClient,
    private readonly registry: DeviceRegistry,
  ) {}

  async handle(topic: string, payload: string): Promise<void> {
    const deviceId = MqttTopics.deviceIdFrom(topic);
    if (!deviceId) {
      console.warn(`[Status] Topico invalido: ${topic}`);
      return;
    }

    let data: DeviceStatusPayload;
    try {
      data = JSON.parse(payload) as DeviceStatusPayload;
    } catch {
      console.warn(`[Status] Payload ilegible de ${deviceId}: ${payload}`);
      return;
    }

    const validStatuses = ['online', 'offline', 'connecting', 'error'];
    if (!validStatuses.includes(data.status)) {
      console.warn(`[Status] Estado desconocido '${data.status}' (${deviceId}).`);
      return;
    }

    if (data.status === 'online') {
      this.registry.markSeen(deviceId);
    }

    try {
      await this.http.postStatus(deviceId, {
        status: data.status,
        firmwareVersion: data.firmwareVersion,
      });
    } catch (err) {
      console.error(
        `[Status] Error reportando estado de ${deviceId}:`,
        errorMessage(err),
      );
    }
  }
}

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
