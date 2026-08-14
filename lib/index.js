// dsh-pet host half — pure browser-side surface plugin.
// The empty apply exists so the plugin appears in the host Loader tree;
// the browser half ships via exports["./client"], discovered from the
// package.json `dsh.client` declaration (same contract as every
// @deepseek-ai/dsh-client-ui-* package).
export function apply() {}
