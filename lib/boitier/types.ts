/**
 * Module Boîtier — contrats de types (interface uniquement).
 *
 * Prépare l'architecture d'un futur boîtier physique (ESP32) sans implémenter
 * la moindre communication. Toute la couche transport (Wi-Fi, BLE, MQTT, HTTP…)
 * sera branchée plus tard derrière l'interface `BoitierClient`, sans changer
 * l'UI ni ces types.
 */

/** État de connexion logique du boîtier. */
export type BoitierConnectionState = "disconnected" | "connecting" | "connected" | "error"

/** État réseau rapporté par le boîtier. */
export type BoitierNetworkState = "online" | "offline" | "unknown"

/** Informations d'identification et d'état d'un boîtier (télémétrie). */
export interface BoitierInfo {
  /** Nom convivial du boîtier. */
  name: string | null
  /** Numéro de série matériel (unique par appareil). */
  serialNumber: string | null
  /** Version du firmware embarqué. */
  firmwareVersion: string | null
  /** Dernière synchronisation réussie (ISO 8601), sinon null. */
  lastSyncAt: string | null
  /** Adresse IP locale attribuée au boîtier. */
  ipAddress: string | null
  /** État du lien réseau. */
  networkState: BoitierNetworkState
}

/** Préférences de fonctionnement du boîtier. */
export interface BoitierSettings {
  /** Synchronisation automatique périodique. */
  autoSync: boolean
  /** Notifications d'événements du boîtier. */
  notifications: boolean
}

/** État complet consommé par l'UI. */
export interface BoitierState {
  connection: BoitierConnectionState
  info: BoitierInfo
  settings: BoitierSettings
}

/**
 * Contrat de communication avec le boîtier physique — À IMPLÉMENTER
 * ULTÉRIEUREMENT (ESP32). Défini dès maintenant pour figer l'architecture ;
 * aucune implémentation n'existe encore.
 */
export interface BoitierClient {
  /** Recherche les boîtiers disponibles sur le réseau. */
  scan(): Promise<BoitierInfo[]>
  /** Établit la connexion avec un boîtier donné. */
  connect(serialNumber: string): Promise<BoitierInfo>
  /** Ferme la connexion courante. */
  disconnect(): Promise<void>
  /** Force une synchronisation et renvoie l'état à jour. */
  sync(): Promise<BoitierInfo>
  /** Applique de nouvelles préférences au boîtier. */
  updateSettings(settings: Partial<BoitierSettings>): Promise<void>
}

/** État initial affiché tant qu'aucun boîtier n'est connecté. */
export const DEFAULT_BOITIER_STATE: BoitierState = {
  connection: "disconnected",
  info: {
    name: null,
    serialNumber: null,
    firmwareVersion: null,
    lastSyncAt: null,
    ipAddress: null,
    networkState: "unknown",
  },
  settings: {
    autoSync: true,
    notifications: true,
  },
}

/** Libellés FR des états de connexion (pour l'affichage). */
export const BOITIER_CONNECTION_LABELS: Record<BoitierConnectionState, string> = {
  disconnected: "Déconnecté",
  connecting: "Connexion…",
  connected: "Connecté",
  error: "Erreur",
}
