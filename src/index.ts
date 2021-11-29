import "log-timestamp";
import Api from "./api";

const { TV_HOST: host, NAME: name, TOKEN_FILE: tokenFile } = process.env;

if (!host) {
  console.error("Unable to initialize; missing required configuration");
  process.exit(1);
}

const init = async () => {
  const api = new Api({ host, name, tokenFile });

  const success = await api.connect();
  if (!success) {
    console.error("Failed to connectl exiting");
    process.exit(1);
  }

  api.addSubscriber((message: Buffer) => {
    console.info(message.toString());
  });

  process.on("exit", function () {
    console.info("Cleaning up connections...");
    api.disconnect();
  });

  // catch ctrl+c event and exit normally
  process.on("SIGINT", function () {
    process.exit(2);
  });
};

init();
