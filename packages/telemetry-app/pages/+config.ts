import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

const config: Config = {
	title: "Telemetry Dashboard",
	description: "Anonymous telemetry dashboard and verification tool",

	extends: [vikeReact],
	passToClient: ["user"],
};

export default config;
