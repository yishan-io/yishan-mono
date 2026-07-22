import { PiProviderConfigError, createPiProviderConfigCancellationError } from "./piProviderConfigErrors";

/** Minimal renderer target contract required to own an authentication lifecycle. */
export type PiProviderAuthenticationTarget = {
  id: number;
  once: (event: "destroyed", listener: () => void) => void;
  removeListener: (event: "destroyed", listener: () => void) => void;
};

type ActiveAuthentication = {
  senderId: number;
  providerId: string;
  controller: AbortController;
  target: PiProviderAuthenticationTarget;
  onDestroyed: () => void;
};

/** Owns the single active provider authentication and restricts cancellation to its initiating renderer. */
export class PiProviderAuthenticationCoordinator {
  private activeAuthentication: ActiveAuthentication | undefined;

  begin(target: PiProviderAuthenticationTarget, providerId: string): AbortSignal {
    if (this.activeAuthentication) {
      throw new PiProviderConfigError("authentication_in_progress", "Provider authentication is already in progress.");
    }
    const controller = new AbortController();
    const onDestroyed = () => {
      const active = this.activeAuthentication;
      if (!active || active.controller !== controller) {
        return;
      }
      this.activeAuthentication = undefined;
      controller.abort(createPiProviderConfigCancellationError());
    };
    this.activeAuthentication = { senderId: target.id, providerId, controller, target, onDestroyed };
    target.once("destroyed", onDestroyed);
    return controller.signal;
  }

  cancel(senderId: number, providerId: string): boolean {
    const active = this.activeAuthentication;
    if (!active || active.senderId !== senderId || active.providerId !== providerId) {
      return false;
    }
    active.controller.abort(createPiProviderConfigCancellationError());
    return true;
  }

  finish(senderId: number, providerId: string): boolean {
    const active = this.activeAuthentication;
    if (!active || active.senderId !== senderId || active.providerId !== providerId) {
      return false;
    }
    active.target.removeListener("destroyed", active.onDestroyed);
    this.activeAuthentication = undefined;
    // End any prompt or native dialog still observing this authentication after it settles.
    active.controller.abort();
    return true;
  }
}
