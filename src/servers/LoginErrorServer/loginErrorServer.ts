import EventEmitter from "events";
import { GatewayServer } from "servers/GatewayServer/gatewayserver";
import { healthThreadDecorator } from "servers/shared/workers/healthWorker";
import SOEClient from "servers/SoeServer/soeclient";

@healthThreadDecorator
class LoginErrorServer extends EventEmitter {
  private _gatewayServer: GatewayServer;
  constructor(serverPort: number, gatewayKey: Uint8Array) {
    super();
    this._gatewayServer = new GatewayServer(serverPort, gatewayKey);
    this._gatewayServer.on(
      "login",
      async (
        client: SOEClient,
        characterId: string,
        loginSessionId: string, // maybe use the loginSessionId to pass the reason
        clientProtocol: string
      ) => {
        console.log("send the packet here");
      }
    );
  }
}
