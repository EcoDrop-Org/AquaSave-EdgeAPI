/**
 * Dominio: registro en memoria de los dispositivos vistos por el edge.
 *
 * El edge descubre los dispositivos por los topicos MQTT en los que
 * publican (telemetria/estado). Solo para los dispositivos vistos se
 * consultan comandos pendientes al backend.
 */
export class DeviceRegistry {
  private readonly lastSeenAt = new Map<string, number>();

  markSeen(deviceId: string): void {
    this.lastSeenAt.set(deviceId, Date.now());
  }

  /** Dispositivos con actividad en los ultimos `maxAgeMs` milisegundos. */
  activeDevices(maxAgeMs: number): string[] {
    const now = Date.now();
    return [...this.lastSeenAt.entries()]
      .filter(([, seenAt]) => now - seenAt <= maxAgeMs)
      .map(([deviceId]) => deviceId);
  }

  knownDevices(): string[] {
    return [...this.lastSeenAt.keys()];
  }
}
