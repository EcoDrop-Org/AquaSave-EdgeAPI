import * as mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';

type MessageHandler = (topic: string, payload: string) => void;

/**
 * Infraestructura: cliente del broker MQTT (Eclipse Mosquitto).
 *
 * Soporta suscripciones con comodines (`+`): cada mensaje entrante se
 * despacha al handler cuyo patron coincida con el topico, pasandole el
 * topico real (para poder extraer el deviceId).
 */
export class MqttBrokerClient {
  private client!: MqttClient;
  private readonly subscriptions = new Map<string, MessageHandler>();

  constructor(private readonly brokerUrl: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const clientId =
        process.env.MQTT_CLIENT_ID ?? `aquasave-edge-${Date.now()}`;
      console.log(`[MQTT] Conectando a ${this.brokerUrl} como ${clientId} ...`);

      this.client = mqtt.connect(this.brokerUrl, { clientId, clean: true });

      this.client.on('connect', () => {
        console.log('[MQTT] Conectado al broker.');
        resolve();
      });

      this.client.on('error', (err) => {
        console.error('[MQTT] Error de conexion:', err.message);
        reject(err);
      });

      this.client.on('message', (topic: string, messageBuffer: Buffer) => {
        const payload = messageBuffer.toString();
        for (const [pattern, handler] of this.subscriptions) {
          if (topicMatches(pattern, topic)) {
            handler(topic, payload);
            return;
          }
        }
        console.warn(`[MQTT] Sin handler para el topico: ${topic}`);
      });

      this.client.on('offline', () =>
        console.warn('[MQTT] Cliente offline — broker inalcanzable.'),
      );
      this.client.on('reconnect', () =>
        console.log('[MQTT] Reintentando conexion...'),
      );
    });
  }

  subscribe(topicPattern: string, handler: MessageHandler): void {
    this.client.subscribe(topicPattern, { qos: 1 }, (err) => {
      if (err) {
        console.error(
          `[MQTT] Fallo al suscribirse a ${topicPattern}:`,
          err.message,
        );
      } else {
        console.log(`[MQTT] Suscrito: ${topicPattern}`);
        this.subscriptions.set(topicPattern, handler);
      }
    });
  }

  publish(topic: string, payload: string): void {
    this.client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Error publicando en ${topic}:`, err.message);
      } else {
        console.log(`[MQTT] Publicado en ${topic}: ${payload}`);
      }
    });
  }
}

/** Coincidencia de topicos MQTT con comodines `+` (un nivel) y `#` (resto). */
const topicMatches = (pattern: string, topic: string): boolean => {
  const patternParts = pattern.split('/');
  const topicParts = topic.split('/');

  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    if (part === '#') return true;
    if (topicParts[i] === undefined) return false;
    if (part !== '+' && part !== topicParts[i]) return false;
  }

  return patternParts.length === topicParts.length;
};
