import { EchoServer } from "./echo-server";
import { BenchParameters, EchoClient } from "./echo-client";

(async function main() {
  const cryptoKey = Buffer.from("F70IaxuU8C/w7FPXY1ibXw==", "base64");
  const echoServer = new EchoServer(1119, cryptoKey);

  // uncomment this to disable multiPackets
  echoServer._waitQueueTimeMs = 0;

  echoServer.start();
  const CLIENTS_NUMBER = 5;
  let clientsDone = 0;
  async function echoAwait(echoClient: EchoClient, clientId: number) {
    const finalTime = await echoClient.getFinalTime();
    console.log(`Took ${finalTime}ms #${clientId}`);
    clientsDone++;
    if (clientsDone === CLIENTS_NUMBER) {
      echoServer.stop();
      process.exit(0);
    }
  }

  const benchParameters: BenchParameters = {
    packetsToExchange: 1000,
    packetsAtATime: 50,
    stopTimerOnAllAcked: false,
    bytesPerPacket: 200
  };

  for (let index = 0; index < CLIENTS_NUMBER; index++) {
    const echoClient = new EchoClient(1119, benchParameters);

    await echoClient.sendSessionRequest();

    echoAwait(echoClient, index);
  }

})()
