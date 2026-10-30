import type { ProveedorReuniones, Reunion } from './tipos';

/** La administradora pega el enlace de la reunión; no hay integración con APIs externas. */
export class ReunionManual implements ProveedorReuniones {
  readonly nombre = 'manual' as const;

  constructor(private readonly enlace: string) {
    let url: URL;
    try {
      url = new URL(enlace);
    } catch {
      throw new Error('El enlace de la reunión no es una URL válida.');
    }
    if (url.protocol !== 'https:') throw new Error('El enlace de la reunión debe empezar con https://');
  }

  async crear(): Promise<Reunion> {
    return { proveedor: 'manual', idExterno: null, enlaceParticipante: this.enlace, enlaceAnfitrion: null };
  }

  async reprogramar(): Promise<void> {}

  async eliminar(): Promise<void> {}
}
