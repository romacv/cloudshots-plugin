# CloudShots for Claude

Lets Claude work with the screenshot library of [CloudShots](https://cloudshots.app) on your Mac. Claude can search by text and tags, read a screenshot's recognized text and see the image, rename, tag and mark screenshots, move them to Trash and back, pin one to the screen, and capture a new screenshot into the library.

## Requirements

- CloudShots for Mac, signed in with an active Pro subscription.
- In CloudShots for Mac, Settings > AI & integrations: turn on "Allow AI agents to use your library".
- Node.js installed on the Mac (the plugin runs one small script with `node`).

## Install

```
/plugin marketplace add romacv/cloudshots-plugin
/plugin install cloudshots@cloudshots
```

Claude asks for the access key when you enable the plugin.

### Where to copy the access key

Open CloudShots for Mac > Settings > AI & integrations. On the MCP server card choose Copy Access Key and paste it when Claude asks. The key is stored in your system's secure credential store. Reset Key on the same card makes a new key and invalidates the old one.

## Tools

| Tool | What it does |
| --- | --- |
| `search_screenshots` | Search the library by text and tags. |
| `list_screenshots` | Page through the library. |
| `get_screenshot` | Details and recognized text of one screenshot. |
| `get_screenshot_image` | The image of one screenshot. |
| `rename_screenshot` | Set the name. |
| `move_to_trash` | Move to Trash. |
| `restore_from_trash` | Restore from Trash. |
| `list_tags` | Your tags with the number of screenshots holding each. |
| `update_tags` | Add and remove tags on up to 200 screenshots. |
| `mark_processed` | Set or clear the processed marker on up to 200 screenshots. |
| `take_screenshot` | Capture a display, a window or a region into the library. |
| `get_original_file` | The original file as captured, with its path. |
| `mark_private` | Mark up to 200 screenshots private (one-way). |
| `restore_original` | Discard your edits to one screenshot. |
| `copy_to_clipboard` | Put one screenshot's image or text on the clipboard. |
| `pin_to_screen` | Pin one screenshot to the screen, or unpin it. |

Nothing is deleted permanently: the most any tool does is move a screenshot to Trash. Private screenshots are never returned.

## Example prompts

- "Find the screenshots from last week that show an error message and tag them `bug`."
- "List my tags and tell me which ones are used only once."
- "Take a screenshot of the Safari window and rename it to 'pricing page'."
- "Show me the screenshot with the flight confirmation and copy its text."
- "Move every screenshot tagged `temp` to Trash."

## How it works

The plugin is a small script, `server.js`, that Claude starts with `node`. It reads one JSON-RPC message per line from Claude, sends each one to the CloudShots server that runs inside the Mac app at `http://cloudshots.local:47819/mcp`, and writes the answer back. The name is used only when it resolves to a loopback address on this Mac; if it does not resolve, or resolves to anything else, the script uses `http://127.0.0.1:47819/mcp` instead, so the access key is never sent to another machine. The server listens on the loopback interface only. A request that gets no answer within two minutes fails with an error instead of hanging. Every request carries your access key as a bearer token. The script has no dependencies and no other network use.

## Privacy Policy

The plugin sends nothing off your Mac. Requests go only to the loopback address of this computer (`127.0.0.1`, or `cloudshots.local` when it resolves there), where the CloudShots app listens. The plugin collects no data, keeps no logs of your library and has no analytics. What Claude does with results it receives is governed by your Claude plan. The CloudShots privacy policy is at https://cloudshots.app/privacy.

## Troubleshooting

- "CloudShots is not running, or 'Allow AI agents to use your library' is off, or Pro is not active": open CloudShots for Mac, check that Pro is active and that the switch in Settings > AI & integrations is on, then try again.
- "The CloudShots access key is wrong": copy the key again from the MCP server card and update the plugin's access key (`/plugin`, then the plugin's settings). If you used Reset Key, the old key no longer works.
- Taking a screenshot fails: allow Screen Recording for CloudShots in System Settings > Privacy & Security.
- `node` not found: install Node.js and restart Claude.

## Support and terms

Documentation: https://cloudshots.app/connect-ai-agents-mac. Support: https://cloudshots.app/support. Terms: https://cloudshots.app/terms.

## License

MIT, see [LICENSE](LICENSE).
