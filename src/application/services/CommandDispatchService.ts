import { MqttTopics } from '../../domain/MqttTopics';
import type { DeviceRegistry } from '../../domain/models/DeviceRegistry';
import type { AquaSaveHttpClient } from '../../infrastructure/http/AquaSaveHttpClient';
import type { MqttBrokerClient } from '../../infrastructure/mqtt/MqttBrokerClient';

/**
 * Aplicacion: despacho de comandos backend -> ESP32.
 *
 * El backend encola comandos (open-valve / close-valve) cuando el usuario
 * inicia/detiene el riego desde la app o cuando se cumple un horario
 * programado. Este servicio:
 *
 *   1. Consulta periodicamente los comandos pendientes de cada dispositivo
 *      visto en MQTT (GET /api/edge/devices/{id}/commands/pending).
 *   2. Los publica en `aquasave/devices/{id}/commands`.
 *   3. Cuando el ESP32 confirma por `.../commands/ack`, avisa al backend
 *      (POST .../commands/{commandId}/ack) para sacarlos de la cola.
 *
 * Mientras el dispositivo no confirme, el comando sigue pendiente en el
 * backend y se reintenta (los comandos son idempotentes en el firmware).
 */
export class CommandDispatchService {
  /** commandId -> timestamp de la ultima publicacion (para no spamear) */
  private readonly publishedAt = new Map<string, number>();

  private static readonly REPUBLISH_AFTER_MS = 10_000;
  private static readonly DEVICE_ACTIVE_WINDOW_MS = 2 * 60_000;

  constructor(
    private readonly http: AquaSaveHttpClient,
    private readonly mqtt: MqttBrokerClient,
    private readonly registry: DeviceRegistry,
  ) {}

  start(pollIntervalMs: number): void {
    setInterval(() => {
      void this.pollOnce();
    }, pollIntervalMs);
    console.log(
      `[Commands] Polling de comandos cada ${pollIntervalMs} ms iniciado.`,
    );
  }

  async pollOnce(): Promise<void> {
    const devices = this.registry.activeDevices(
      CommandDispatchService.DEVICE_ACTIVE_WINDOW_MS,
    );

    for (const deviceId of devices) {
      try {
        const pending = await this.http.getPendingCommands(deviceId);
        for (const command of pending) {
          this.publishIfDue(deviceId, command.id, command.type);
        }
      } catch (err) {
        console.error(
          `[Commands] Error consultando comandos de ${deviceId}:`,
          errorMessage(err),
        );
      }
    }
  }

  /** Ack recibido del ESP32 por MQTT: confirmar al backend. */
  async onDeviceAck(topic: string, payload: string): Promise<void> {
    const deviceId = MqttTopics.deviceIdFrom(topic);
    if (!deviceId) return;

    let commandId: string | undefined;
    try {
      commandId = (JSON.parse(payload) as { commandId?: string }).commandId;
    } catch {
      console.warn(`[Commands] Ack ilegible de ${deviceId}: ${payload}`);
      return;
    }
    if (!commandId) return;

    this.publishedAt.delete(commandId);

    try {
      await this.http.acknowledgeCommand(deviceId, commandId);
    } catch (err) {
      console.error(
        `[Commands] Error confirmando ${commandId} al backend:`,
        errorMessage(err),
      );
    }
  }

  private publishIfDue(
    deviceId: string,
    commandId: string,
    type: string,
  ): void {
    const lastPublished = this.publishedAt.get(commandId) ?? 0;
    if (Date.now() - lastPublished < CommandDispatchService.REPUBLISH_AFTER_MS) {
      return;
    }

    this.publishedAt.set(commandId, Date.now());
    this.mqtt.publish(
      MqttTopics.commandsFor(deviceId),
      JSON.stringify({ commandId, type }),
    );
  }
}

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
