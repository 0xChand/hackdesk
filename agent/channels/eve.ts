import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";
import { eveChannel, type EveAuthFn } from "eve/channels/eve";

// Local dev callers (the TUI, the board's chat panel, `eve eval`) may stub tools,
// so evals can pin what GitHub and challenge pages return. Production never can.
const local = localDev();
const localWithStubs: EveAuthFn = async (request) => {
  const caller = await local(request);
  return caller ? { ...caller, allowToolStubs: true } : null;
};

export default eveChannel({
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    localWithStubs,
    // Rejects browser traffic in production until real auth replaces it.
    placeholderAuth(),
  ],
});
