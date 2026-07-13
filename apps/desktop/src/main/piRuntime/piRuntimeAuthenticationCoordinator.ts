type ActiveAuthentication = {
  senderId: number;
  providerId: string;
  controller: AbortController;
};

/** Owns the single active provider authentication and restricts cancellation to its initiating renderer. */
export class PiRuntimeAuthenticationCoordinator {
  private activeAuthentication: ActiveAuthentication | undefined;

  begin(senderId: number, providerId: string): AbortSignal {
    if (this.activeAuthentication) {
      throw new Error("Provider authentication is already in progress.");
    }
    const controller = new AbortController();
    this.activeAuthentication = { senderId, providerId, controller };
    return controller.signal;
  }

  cancel(senderId: number, providerId: string): boolean {
    const active = this.activeAuthentication;
    if (!active || active.senderId !== senderId || active.providerId !== providerId) {
      return false;
    }
    active.controller.abort(new Error("Login cancelled."));
    return true;
  }

  finish(senderId: number, providerId: string): boolean {
    const active = this.activeAuthentication;
    if (!active || active.senderId !== senderId || active.providerId !== providerId) {
      return false;
    }
    this.activeAuthentication = undefined;
    return true;
  }
}
