import { EventEmitter } from "node:events";
import Bonjour from "bonjour-service";
import {
  PROTOCOL_VERSION,
  labAdvertisementSchema,
  type LabAdvertisement,
  type PersistedState
} from "@lab-fleet/shared";

export class DiscoveryService extends EventEmitter {
  private bonjour: Bonjour | undefined;
  private publication: ReturnType<Bonjour["publish"]> | undefined;
  private browser: ReturnType<Bonjour["find"]> | undefined;
  private readonly advertisements = new Map<string, LabAdvertisement>();

  publish(state: PersistedState, port: number): void {
    if (!state.host?.labId || !state.host.labName) return;
    this.stopPublication();
    this.bonjour ??= new Bonjour();
    this.publication = this.bonjour.publish({
      name: `Lab Fleet ${state.host.labName} ${state.installationId.slice(0, 8)}`,
      type: "labfleet",
      protocol: "tcp",
      port,
      txt: {
        v: String(PROTOCOL_VERSION),
        hostId: state.installationId,
        school: state.host.schoolName,
        labId: state.host.labId,
        lab: state.host.labName,
        fp: state.tls.fingerprint
      }
    });
  }

  browse(): void {
    if (this.browser) return;
    this.bonjour ??= new Bonjour();
    this.browser = this.bonjour.find({ type: "labfleet", protocol: "tcp" }, (service) => {
      const address = selectAddress(service.addresses ?? []);
      const txt = service.txt as Record<string, string> | undefined;
      if (!address || !txt) return;
      const candidate = {
        protocolVersion: Number(txt.v),
        hostId: txt.hostId,
        schoolName: txt.school,
        labId: txt.labId,
        labName: txt.lab,
        address,
        port: service.port,
        fingerprint: txt.fp,
        discoveredAt: new Date().toISOString()
      };
      const parsed = labAdvertisementSchema.safeParse(candidate);
      if (!parsed.success) return;
      this.advertisements.set(parsed.data.hostId, parsed.data);
      this.emit("discovered", parsed.data);
    });
  }

  list(): LabAdvertisement[] {
    return [...this.advertisements.values()].sort((left, right) => left.labName.localeCompare(right.labName));
  }

  stop(): void {
    this.browser?.stop();
    this.browser = undefined;
    this.stopPublication();
    this.bonjour?.destroy();
    this.bonjour = undefined;
  }

  private stopPublication(): void {
    this.publication?.stop();
    this.publication = undefined;
  }
}

function selectAddress(addresses: string[]): string | undefined {
  return addresses.find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address) && !address.startsWith("127."));
}
