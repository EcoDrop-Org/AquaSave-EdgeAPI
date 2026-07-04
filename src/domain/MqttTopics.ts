/**
 * Registro centralizado de los topicos MQTT del sistema AquaSave.
 * Debe coincidir con los topicos definidos en el firmware (AquaSave.ino).
 *
 *   aquasave/devices/<deviceId>/telemetry     ESP32 -> edge (lecturas cada 5 s)
 *   aquasave/devices/<deviceId>/status        ESP32 -> edge (online/offline, retained + LWT)
 *   aquasave/devices/<deviceId>/commands      edge  -> ESP32 (open-valve / close-valve)
 *   aquasave/devices/<deviceId>/commands/ack  ESP32 -> edge (confirmacion de comando)
 */
export const MqttTopics = {
  /** Suscripcion comodin: telemetria de cualquier dispositivo */
  TELEMETRY_WILDCARD: 'aquasave/devices/+/telemetry',

  /** Suscripcion comodin: estado online/offline de cualquier dispositivo */
  STATUS_WILDCARD: 'aquasave/devices/+/status',

  /** Suscripcion comodin: confirmaciones de comandos */
  COMMAND_ACK_WILDCARD: 'aquasave/devices/+/commands/ack',

  /** Topico de comandos hacia un dispositivo concreto */
  commandsFor(deviceId: string): string {
    return `aquasave/devices/${deviceId}/commands`;
  },

  /**
   * Extrae el deviceId de un topico `aquasave/devices/<id>/...`.
   * Devuelve undefined si el topico no tiene esa forma.
   */
  deviceIdFrom(topic: string): string | undefined {
    const parts = topic.split('/');
    if (parts[0] !== 'aquasave' || parts[1] !== 'devices' || !parts[2]) {
      return undefined;
    }
    return parts[2];
  },
} as const;
