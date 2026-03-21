import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";

const execFileAsync = promisify(execFile);

describe("patch-whatsapp-bridge.py", () => {
  it("patches the pinned upstream WhatsApp bridge fixture and stays idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-whatsapp-bridge-patch-"));
    const fixturePath = join(process.cwd(), "tests", "fixtures", "whatsapp-bridge.upstream.js");
    const scriptPath = join(process.cwd(), "templates", "patch-whatsapp-bridge.py");
    const bridgePath = join(root, "bridge.js");

    try {
      await copyFile(fixturePath, bridgePath);

      const before = await readFile(bridgePath, "utf8");
      await execFileAsync("python3", [scriptPath, bridgePath]);
      const after = await readFile(bridgePath, "utf8");

      assert.notEqual(after, before);
      assert.match(after, /function getSelfNumber/);
      assert.match(after, /function getSelfLid/);
      assert.match(after, /function unwrapMessageContent/);
      assert.match(after, /function normalizeChatId/);
      assert.match(after, /function isImplicitSelfLidChatId/);
      assert.match(after, /function isSelfChatId/);
      assert.match(after, /function getEditTargetMessageId/);
      assert.match(after, /function getEditedMessageUpdateContent/);
      assert.match(after, /function getMessageUpdateChatId/);
      assert.match(after, /function getUpdateTargetMessageId/);
      assert.match(after, /return getEditedMessageUpdateContent\(update\) \? \(update\?\.key\?\.id \|\| update\?\.update\?\.key\?\.id \|\| ''\) : '';/);
      assert.match(after, /function rememberPendingEdit/);
      assert.match(after, /function consumePendingEdit/);
      assert.match(after, /function rememberMessageId/);
      assert.match(after, /function logBridgeDiagnostic/);
      assert.match(after, /logBridgeDiagnostic\('connection\.open'/);
      assert.match(after, /selfNumber: getSelfNumber\(\)/);
      assert.match(after, /selfLid: getSelfLid\(\)/);
      assert.match(after, /app\.get\('\/health', \(req, res\) => \{[\s\S]*hermes-fly: expose paired account identity for self-chat validation[\s\S]*selfJid: getSelfJid\(\),[\s\S]*selfNumber: getSelfNumber\(\)/);
      assert.match(after, /WHATSAPP_MODE === 'self-chat' && type === 'append'/);
      assert.match(after, /const myLid = getSelfLid\(\)\.replace\(\/@\.\*\/, ''\);/);
      assert.match(after, /const isSelfChat = \(myNumber && chatNumber === myNumber\) \|\| \(myLid && chatNumber === myLid\);/);
      assert.match(after, /messages\.upsert\.accepted/);
      assert.match(after, /messages\.upsert\.queued/);
      assert.match(after, /messages\.poll\.drained/);
      assert.match(after, /reason: 'duplicate-message-id'/);
      assert.match(after, /reason: 'agent-echo'/);
      assert.match(after, /echoType: 'edit'/);
      assert.match(after, /const activeReplyPrefix = typeof REPLY_PREFIX !== 'undefined' \? REPLY_PREFIX : '⚕ \*Hermes Agent\*\\n────────────\\n';/);
      assert.doesNotMatch(after, /reason: 'agent-edit-echo'/);
      assert.match(after, /reason: summary\.protocolType !== null \? 'protocol-message-no-content' : 'empty-body-no-media'/);
      assert.doesNotMatch(after, /body\.startsWith\('⚕ \*Hermes Agent\*\\n────────────\\n'\)/);
      assert.match(after, /reason: 'missing-message-payload'/);
      assert.match(after, /const resolvedNumber =/);
      assert.match(after, /return `self-chat:\$\{targetMessageId\}`;/);
      assert.match(after, /return `\$\{normalizeChatId\(chatId\)\}:\$\{targetMessageId\}`;/);
      assert.match(after, /pending\.push\(now \+ PENDING_EDIT_WINDOW_MS\);/);
      assert.match(after, /pending\.shift\(\);/);
      assert.match(after, /const editTargetMessageId = getEditTargetMessageId\(msg\.message\);/);
      assert.match(after, /WHATSAPP_MODE === 'self-chat' && isSelfChatId\(chatId\) && consumePendingEdit\(chatId, editTargetMessageId\)/);
      assert.match(after, /sock\.ev\.on\('messages\.update', \(updates\) => \{/);
      assert.match(after, /const chatId = getMessageUpdateChatId\(update\);/);
      assert.match(after, /const editedMessage = getEditedMessageUpdateContent\(update\);/);
      assert.match(after, /if \(WHATSAPP_MODE !== 'self-chat' \|\| !isSelfChatId\(chatId\) \|\| !editedMessage\) \{/);
      assert.match(after, /const targetMessageId = getUpdateTargetMessageId\(update\);/);
      assert.match(after, /logBridgeDiagnostic\('messages\.update\.skipped', \{/);
      assert.match(after, /if \(WHATSAPP_MODE === 'self-chat'\) \{[\s\S]*rememberPendingEdit\(chatId, messageId\);[\s\S]*\}[\s\S]*const sent = await sock\.sendMessage\(chatId, \{/);
      assert.match(after, /rememberMessageId\(sent\?\.key\?\.id\);/);
      assert.doesNotMatch(after, /downloadMediaMessage\(msg, 'buffer'/);
      assert.doesNotMatch(after, /IMAGE_CACHE_DIR/);
      await execFileAsync(process.execPath, ["--check", bridgePath]);

      await execFileAsync("python3", [scriptPath, bridgePath]);
      const afterAgain = await readFile(bridgePath, "utf8");
      assert.equal(afterAgain, after);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("patches the current upstream WhatsApp bridge shape and stays idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-whatsapp-bridge-patch-main-"));
    const fixturePath = join(process.cwd(), "tests", "fixtures", "whatsapp-bridge.upstream.js");
    const scriptPath = join(process.cwd(), "templates", "patch-whatsapp-bridge.py");
    const bridgePath = join(root, "bridge.js");

    try {
      let currentMainLike = await readFile(fixturePath, "utf8");
      currentMainLike = currentMainLike.replace(
        "  sock.ev.on('messages.upsert', ({ messages, type }) => {\n",
        "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n"
      );
      currentMainLike = currentMainLike.replace(
        "const PORT = parseInt(getArg('port', '3000'), 10);\n",
        `const WHATSAPP_DEBUG =
  typeof process !== 'undefined' &&
  process.env &&
  typeof process.env.WHATSAPP_DEBUG === 'string' &&
  ['1', 'true', 'yes', 'on'].includes(process.env.WHATSAPP_DEBUG.toLowerCase());

const PORT = parseInt(getArg('port', '3000'), 10);
`
      );
      currentMainLike = currentMainLike.replace(
        "const ALLOWED_USERS = (process.env.WHATSAPP_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);\n",
        `const ALLOWED_USERS = (process.env.WHATSAPP_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_REPLY_PREFIX = '⚕ *Hermes Agent*\\n────────────\\n';
const REPLY_PREFIX = process.env.WHATSAPP_REPLY_PREFIX === undefined
  ? DEFAULT_REPLY_PREFIX
  : process.env.WHATSAPP_REPLY_PREFIX.replace(/\\\\n/g, '\\n');

function formatOutgoingMessage(message) {
  return REPLY_PREFIX ? \`\${REPLY_PREFIX}\${message}\` : message;
}
`
      );
      currentMainLike = currentMainLike.replace(
        "// Message queue for polling\nconst messageQueue = [];\nconst MAX_QUEUE_SIZE = 100;\n\nlet sock = null;\n",
        `// Message queue for polling
const messageQueue = [];
const MAX_QUEUE_SIZE = 100;

// Track recently sent message IDs to prevent echo-back loops with media
const recentlySentIds = new Set();
const MAX_RECENT_IDS = 50;

let sock = null;
`
      );
      currentMainLike = currentMainLike.replace(
        "    if (type !== 'notify') return;\n",
        `    // In self-chat mode, your own messages commonly arrive as 'append' rather
    // than 'notify'. Accept both and filter agent echo-backs below.
    if (type !== 'notify' && type !== 'append') return;
`
      );
      currentMainLike = currentMainLike.replace(
        "      const chatId = msg.key.remoteJid;\n",
        `      const chatId = msg.key.remoteJid;
      if (WHATSAPP_DEBUG) {
        try {
          console.log(JSON.stringify({
            event: 'upsert', type,
            fromMe: !!msg.key.fromMe, chatId,
            senderId: msg.key.participant || chatId,
            messageKeys: Object.keys(msg.message || {}),
          }));
        } catch {}
      }
`
      );
      currentMainLike = currentMainLike.replace(
        `        // Self-chat mode: only allow messages in the user's own self-chat
        const myNumber = (sock.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
        const chatNumber = chatId.replace(/@.*/, '');
        const isSelfChat = myNumber && chatNumber === myNumber;
`,
        `        // Self-chat mode: only allow messages in the user's own self-chat
        // WhatsApp now uses LID (Linked Identity Device) format: 67427329167522@lid
        // AND classic format: 34652029134@s.whatsapp.net
        // sock.user has both: { id: "number:10@s.whatsapp.net", lid: "lid_number:10@lid" }
        const myNumber = (sock.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
        const myLid = (sock.user?.lid || '').replace(/:.*@/, '@').replace(/@.*/, '');
        const chatNumber = chatId.replace(/@.*/, '');
        const isSelfChat = (myNumber && chatNumber === myNumber) || (myLid && chatNumber === myLid);
`
      );
      currentMainLike = currentMainLike.replace(
        `      if (msg.message.conversation) {
        body = msg.message.conversation;
      } else if (msg.message.extendedTextMessage?.text) {
        body = msg.message.extendedTextMessage.text;
      } else if (msg.message.imageMessage) {
        body = msg.message.imageMessage.caption || '';
        hasMedia = true;
        mediaType = 'image';
      } else if (msg.message.videoMessage) {
        body = msg.message.videoMessage.caption || '';
        hasMedia = true;
        mediaType = 'video';
      } else if (msg.message.audioMessage || msg.message.pttMessage) {
        hasMedia = true;
        mediaType = msg.message.pttMessage ? 'ptt' : 'audio';
      } else if (msg.message.documentMessage) {
        body = msg.message.documentMessage.caption || msg.message.documentMessage.fileName || '';
        hasMedia = true;
        mediaType = 'document';
      }
`,
        `      if (msg.message.conversation) {
        body = msg.message.conversation;
      } else if (msg.message.extendedTextMessage?.text) {
        body = msg.message.extendedTextMessage.text;
      } else if (msg.message.imageMessage) {
        body = msg.message.imageMessage.caption || '';
        hasMedia = true;
        mediaType = 'image';
        try {
          const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
          const mime = msg.message.imageMessage.mimetype || 'image/jpeg';
          const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
          const ext = extMap[mime] || '.jpg';
          mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
          const filePath = path.join(IMAGE_CACHE_DIR, \`img_\${randomBytes(6).toString('hex')}\${ext}\`);
          writeFileSync(filePath, buf);
          mediaUrls.push(filePath);
        } catch (err) {
          console.error('[bridge] Failed to download image:', err.message);
        }
      } else if (msg.message.videoMessage) {
        body = msg.message.videoMessage.caption || '';
        hasMedia = true;
        mediaType = 'video';
      } else if (msg.message.audioMessage || msg.message.pttMessage) {
        hasMedia = true;
        mediaType = msg.message.pttMessage ? 'ptt' : 'audio';
      } else if (msg.message.documentMessage) {
        body = msg.message.documentMessage.caption || msg.message.documentMessage.fileName || '';
        hasMedia = true;
        mediaType = 'document';
      }
`
      );
      currentMainLike = currentMainLike.replace(
        "      // Check allowlist for messages from others\n      if (!msg.key.fromMe && ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(senderNumber)) {\n        continue;\n      }\n",
        `      // Check allowlist for messages from others (resolve LID → phone if needed)
      if (!msg.key.fromMe && ALLOWED_USERS.length > 0) {
        const resolvedNumber = lidToPhone[senderNumber] || senderNumber;
        if (!ALLOWED_USERS.includes(resolvedNumber)) continue;
      }
`
      );
      currentMainLike = currentMainLike.replace(
        `      // Skip empty messages
      if (!body && !hasMedia) continue;
`,
        `      // Ignore Hermes' own reply messages in self-chat mode to avoid loops.
      if (msg.key.fromMe && ((REPLY_PREFIX && body.startsWith(REPLY_PREFIX)) || recentlySentIds.has(msg.key.id))) {
        if (WHATSAPP_DEBUG) {
          try { console.log(JSON.stringify({ event: 'ignored', reason: 'agent_echo', chatId, messageId: msg.key.id })); } catch {}
        }
        continue;
      }

      // Skip empty messages
      if (!body && !hasMedia) {
        if (WHATSAPP_DEBUG) {
          try { 
            console.log(JSON.stringify({ event: 'ignored', reason: 'empty', chatId, messageKeys: Object.keys(msg.message || {}) })); 
          } catch (err) {
            console.error('Failed to log empty message event:', err);
          }
        }
        continue;
      }
`
      );
      currentMainLike = currentMainLike.replace(
        "    const prefixed = `⚕ *Hermes Agent*\\n────────────\\n${message}`;\n    const sent = await sock.sendMessage(chatId, { text: prefixed });\n",
        `    const sent = await sock.sendMessage(chatId, { text: formatOutgoingMessage(message) });

    if (sent?.key?.id) {
      recentlySentIds.add(sent.key.id);
      if (recentlySentIds.size > MAX_RECENT_IDS) {
        recentlySentIds.delete(recentlySentIds.values().next().value);
      }
    }
`
      );
      currentMainLike = currentMainLike.replace(
        "    const prefixed = `⚕ *Hermes Agent*\\n────────────\\n${message}`;\n    const key = { id: messageId, fromMe: true, remoteJid: chatId };\n    await sock.sendMessage(chatId, { text: prefixed, edit: key });\n",
        `    const key = { id: messageId, fromMe: true, remoteJid: chatId };
    await sock.sendMessage(chatId, { text: formatOutgoingMessage(message), edit: key });
`
      );

      await writeFile(bridgePath, currentMainLike, "utf8");

      const before = await readFile(bridgePath, "utf8");
      await execFileAsync("python3", [scriptPath, bridgePath]);
      const after = await readFile(bridgePath, "utf8");

      assert.notEqual(after, before);
      assert.match(after, /function getSelfNumber/);
      assert.match(after, /function getSelfLid/);
      assert.match(after, /function unwrapMessageContent/);
      assert.match(after, /function normalizeChatId/);
      assert.match(after, /function isImplicitSelfLidChatId/);
      assert.match(after, /function isSelfChatId/);
      assert.match(after, /function getEditTargetMessageId/);
      assert.match(after, /function getEditedMessageUpdateContent/);
      assert.match(after, /function getMessageUpdateChatId/);
      assert.match(after, /function getUpdateTargetMessageId/);
      assert.match(after, /return getEditedMessageUpdateContent\(update\) \? \(update\?\.key\?\.id \|\| update\?\.update\?\.key\?\.id \|\| ''\) : '';/);
      assert.match(after, /function rememberPendingEdit/);
      assert.match(after, /function consumePendingEdit/);
      assert.match(after, /function rememberMessageId/);
      assert.match(after, /logBridgeDiagnostic\('connection\.open'/);
      assert.match(after, /const allowAppendBatch = WHATSAPP_MODE === 'self-chat' && type === 'append';/);
      assert.match(after, /const myLid = getSelfLid\(\)\.replace\(\/@\.\*\/, ''\);/);
      assert.match(after, /reason: 'agent-echo'/);
      assert.match(after, /echoType: 'edit'/);
      assert.match(after, /const activeReplyPrefix = typeof REPLY_PREFIX !== 'undefined' \? REPLY_PREFIX : '⚕ \*Hermes Agent\*\\n────────────\\n';/);
      assert.doesNotMatch(after, /reason: 'agent-edit-echo'/);
      assert.match(after, /reason: summary\.protocolType !== null \? 'protocol-message-no-content' : 'empty-body-no-media'/);
      assert.match(after, /const resolvedNumber =/);
      assert.doesNotMatch(after, /body\.startsWith\('⚕ \*Hermes Agent\*\\n────────────\\n'\)/);
      assert.match(after, /return `self-chat:\$\{targetMessageId\}`;/);
      assert.match(after, /return `\$\{normalizeChatId\(chatId\)\}:\$\{targetMessageId\}`;/);
      assert.match(after, /pending\.push\(now \+ PENDING_EDIT_WINDOW_MS\);/);
      assert.match(after, /pending\.shift\(\);/);
      assert.match(after, /const editTargetMessageId = getEditTargetMessageId\(msg\.message\);/);
      assert.match(after, /WHATSAPP_MODE === 'self-chat' && isSelfChatId\(chatId\) && consumePendingEdit\(chatId, editTargetMessageId\)/);
      assert.match(after, /sock\.ev\.on\('messages\.update', \(updates\) => \{/);
      assert.match(after, /const chatId = getMessageUpdateChatId\(update\);/);
      assert.match(after, /const editedMessage = getEditedMessageUpdateContent\(update\);/);
      assert.match(after, /if \(WHATSAPP_MODE !== 'self-chat' \|\| !isSelfChatId\(chatId\) \|\| !editedMessage\) \{/);
      assert.match(after, /const targetMessageId = getUpdateTargetMessageId\(update\);/);
      assert.match(after, /logBridgeDiagnostic\('messages\.update\.skipped', \{/);
      assert.match(after, /if \(WHATSAPP_MODE === 'self-chat'\) \{[\s\S]*rememberPendingEdit\(chatId, messageId\);[\s\S]*\}[\s\S]*const sent = await sock\.sendMessage\(chatId, \{/);
      assert.match(after, /rememberMessageId\(sent\?\.key\?\.id\);/);
      assert.match(after, /sock\.ev\.on\('messages\.upsert', async \(\{ messages, type \}\) => \{/);
      await execFileAsync(process.execPath, ["--check", bridgePath]);

      await execFileAsync("python3", [scriptPath, bridgePath]);
      const afterAgain = await readFile(bridgePath, "utf8");
      assert.equal(afterAgain, after);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
