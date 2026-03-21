#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


def replace_once(source_text: str, old: str, new: str, label: str, marker: str) -> str:
    if marker in source_text:
        return source_text
    if old not in source_text:
        raise RuntimeError(f"could not patch Hermes WhatsApp bridge ({label})")
    return source_text.replace(old, new, 1)


def replace_once_any(source_text: str, olds: tuple[str, ...], new: str, label: str, marker: str) -> str:
    if marker in source_text:
        return source_text
    for old in olds:
        if old in source_text:
            return source_text.replace(old, new, 1)
    raise RuntimeError(f"could not patch Hermes WhatsApp bridge ({label})")


def replace_once_variants(
    source_text: str,
    variants: tuple[tuple[str, str], ...],
    label: str,
    marker: str,
) -> str:
    if marker in source_text:
        return source_text
    for old, new in variants:
        if old in source_text:
            return source_text.replace(old, new, 1)
    raise RuntimeError(f"could not patch Hermes WhatsApp bridge ({label})")


HELPER_BLOCK = """let connectionState = 'disconnected';
const recentMessageIds = new Set();
const recentMessageIdOrder = [];
const MAX_RECENT_MESSAGE_IDS = 512;
const APPEND_RECENT_WINDOW_MS = 2 * 60 * 1000;
const pendingEditTargets = new Map();
const PENDING_EDIT_WINDOW_MS = 30 * 1000;

function getSelfJid() {
  return (sock?.user?.id || '').replace(/:.*@/, '@');
}

function getSelfLid() {
  return (sock?.user?.lid || '').replace(/:.*@/, '@');
}

function getSelfNumber() {
  return getSelfJid().replace(/@.*/, '');
}

function normalizeChatId(chatId) {
  const normalized = (chatId || '').replace(/:.*@/, '@');
  if (!normalized) return '';
  const selfJid = getSelfJid();
  const selfLid = getSelfLid();
  const normalizedLocalId = normalized.replace(/@.*/, '');
  const selfLocalId = selfJid.replace(/@.*/, '');
  const selfLidLocalId = selfLid.replace(/@.*/, '');
  if (
    (selfJid && normalized === selfJid) ||
    (selfLid && normalized === selfLid) ||
    (selfLocalId && normalizedLocalId === selfLocalId) ||
    (selfLidLocalId && normalizedLocalId === selfLidLocalId)
  ) {
    return 'self-chat';
  }
  return normalized;
}

function isImplicitSelfLidChatId(chatId) {
  const normalized = (chatId || '').replace(/:.*@/, '@');
  return Boolean(
    WHATSAPP_MODE === 'self-chat'
    && normalized
    && normalized.endsWith('@lid')
    && !normalized.endsWith('@g.us')
    && !normalized.includes('status')
    && !getSelfLid()
    && (getSelfJid() || getSelfNumber())
  );
}

function isSelfChatId(chatId) {
  return normalizeChatId(chatId) === 'self-chat' || isImplicitSelfLidChatId(chatId);
}

function getPendingEditKey(chatId, targetMessageId) {
  if (!chatId || !targetMessageId) return '';
  if (isImplicitSelfLidChatId(chatId)) {
    return `self-chat:${targetMessageId}`;
  }
  return `${normalizeChatId(chatId)}:${targetMessageId}`;
}

function rememberPendingEdit(chatId, targetMessageId) {
  const key = getPendingEditKey(chatId, targetMessageId);
  if (!key) return;
  const now = Date.now();
  const pending = (pendingEditTargets.get(key) || []).filter((expiresAt) => expiresAt >= now);
  pending.push(now + PENDING_EDIT_WINDOW_MS);
  pendingEditTargets.set(key, pending);
}

function consumePendingEdit(chatId, targetMessageId) {
  const key = getPendingEditKey(chatId, targetMessageId);
  if (!key) return false;
  const now = Date.now();
  const pending = (pendingEditTargets.get(key) || []).filter((expiresAt) => expiresAt >= now);
  if (pending.length === 0) {
    pendingEditTargets.delete(key);
    return false;
  }
  pending.shift();
  if (pending.length === 0) {
    pendingEditTargets.delete(key);
  } else {
    pendingEditTargets.set(key, pending);
  }
  return true;
}

function unwrapMessageContent(message) {
  let current = message;
  while (current && typeof current === 'object') {
    if (current.deviceSentMessage?.message) {
      current = current.deviceSentMessage.message;
      continue;
    }
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    if (current.editedMessage?.message) {
      current = current.editedMessage.message;
      continue;
    }
    if (current.protocolMessage?.editedMessage) {
      current = current.protocolMessage.editedMessage;
      continue;
    }
    break;
  }
  return current;
}

function getEditTargetMessageId(message) {
  let current = message;
  while (current && typeof current === 'object') {
    if (current.protocolMessage?.key?.id) {
      return current.protocolMessage.key.id;
    }
    if (current.deviceSentMessage?.message) {
      current = current.deviceSentMessage.message;
      continue;
    }
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    if (current.editedMessage?.message) {
      current = current.editedMessage.message;
      continue;
    }
    if (current.protocolMessage?.editedMessage) {
      current = current.protocolMessage.editedMessage;
      continue;
    }
    break;
  }
  return '';
}

function getEditedMessageUpdateContent(update) {
  let current = update?.update?.message;
  while (current && typeof current === 'object') {
    if (current.editedMessage?.message) {
      return current.editedMessage.message;
    }
    if (current.protocolMessage?.editedMessage) {
      return current.protocolMessage.editedMessage;
    }
    if (current.deviceSentMessage?.message) {
      current = current.deviceSentMessage.message;
      continue;
    }
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }
  return null;
}

function getMessageUpdateChatId(update) {
  return update?.key?.remoteJid || update?.update?.key?.remoteJid || '';
}

function getUpdateTargetMessageId(update) {
  return getEditedMessageUpdateContent(update) ? (update?.key?.id || update?.update?.key?.id || '') : '';
}

function getMessageTimestampMs(msg) {
  const raw = msg?.messageTimestamp;
  if (typeof raw === 'number') return raw * 1000;
  if (typeof raw === 'bigint') return Number(raw) * 1000;
  if (typeof raw === 'string' && /^[0-9]+$/.test(raw)) return Number(raw) * 1000;
  if (raw && typeof raw.toNumber === 'function') return raw.toNumber() * 1000;
  return 0;
}

function rememberMessageId(messageId) {
  if (!messageId) {
    return true;
  }
  if (recentMessageIds.has(messageId)) {
    return false;
  }
  recentMessageIds.add(messageId);
  recentMessageIdOrder.push(messageId);
  if (recentMessageIdOrder.length > MAX_RECENT_MESSAGE_IDS) {
    const evicted = recentMessageIdOrder.shift();
    if (evicted) recentMessageIds.delete(evicted);
  }
  return true;
}

function logBridgeDiagnostic(event, payload = {}) {
  const entry = {
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  console.log(`[hermes-whatsapp-bridge] ${JSON.stringify(entry)}`);
}

function summarizeUpsertMessage(msg, batchType) {
  const key = msg?.key || {};
  const chatId = key.remoteJid || '';
  const senderId = key.participant || chatId;
  const content = unwrapMessageContent(msg?.message);
  return {
    batchType,
    messageId: key.id || '',
    remoteJid: chatId,
    senderId,
    fromMe: Boolean(key.fromMe),
    hasMessage: Boolean(msg?.message),
    messageStubType: msg?.messageStubType ?? null,
    protocolType: msg?.message?.protocolMessage?.type ?? null,
    messageTypes: content ? Object.keys(content) : [],
  };
}

function summarizeMessageUpdate(update) {
  const key = update?.key || {};
  const chatId = getMessageUpdateChatId(update);
  const senderId = key.participant || chatId;
  const content = unwrapMessageContent(getEditedMessageUpdateContent(update));
  return {
    messageId: key.id || '',
    remoteJid: chatId,
    senderId,
    fromMe: Boolean(key.fromMe),
    hasMessage: Boolean(getEditedMessageUpdateContent(update)),
    messageTypes: content ? Object.keys(content) : [],
  };
}
"""


def patch_bridge(source_text: str) -> str:
    source_text = replace_once(
        source_text,
        "let connectionState = 'disconnected';\n",
        HELPER_BLOCK,
        "helpers",
        "function logBridgeDiagnostic(event, payload = {}) {",
    )
    source_text = replace_once(
        source_text,
        """    } else if (connection === 'open') {
      connectionState = 'connected';
      console.log('✅ WhatsApp connected!');
      if (PAIR_ONLY) {
""",
        """    } else if (connection === 'open') {
      connectionState = 'connected';
      console.log('✅ WhatsApp connected!');
      logBridgeDiagnostic('connection.open', {
        selfJid: getSelfJid(),
        selfNumber: getSelfNumber(),
        selfLid: getSelfLid(),
      });
      if (PAIR_ONLY) {
""",
        "connection open identity",
        "logBridgeDiagnostic('connection.open'",
    )
    source_text = replace_once(
        source_text,
        """app.get('/health', (req, res) => {
  res.json({
    status: connectionState,
    queueLength: messageQueue.length,
    uptime: process.uptime(),
  });
});
""",
        """app.get('/health', (req, res) => {
  res.json({
    status: connectionState,
    queueLength: messageQueue.length,
    uptime: process.uptime(),
    // hermes-fly: expose paired account identity for self-chat validation
    selfJid: getSelfJid(),
    selfNumber: getSelfNumber(),
    selfLid: getSelfLid(),
  });
});
""",
        "health identity",
        "hermes-fly: expose paired account identity for self-chat validation",
    )
    source_text = replace_once_any(
        source_text,
        (
            "    if (type !== 'notify') return;\n",
            """    // In self-chat mode, your own messages commonly arrive as 'append' rather
    // than 'notify'. Accept both and filter agent echo-backs below.
    if (type !== 'notify' && type !== 'append') return;
""",
        ),
        """    const allowAppendBatch = WHATSAPP_MODE === 'self-chat' && type === 'append';
    if (type !== 'notify' && !allowAppendBatch) {
      logBridgeDiagnostic('messages.upsert.skipped', {
        reason: 'non-notify-batch',
        batchType: type,
        count: Array.isArray(messages) ? messages.length : 0,
      });
      return;
    }
""",
        "notify guard",
        "reason: 'non-notify-batch'",
    )
    source_text = replace_once(
        source_text,
        "    for (const msg of messages) {\n",
        """    for (const msg of messages) {
      const summary = summarizeUpsertMessage(msg, type);
""",
        "upsert summary",
        "const summary = summarizeUpsertMessage(msg, type);",
    )
    source_text = replace_once(
        source_text,
        "      if (!msg.message) continue;\n",
        """      if (!msg.message) {
        logBridgeDiagnostic('messages.upsert.skipped', {
          ...summary,
          reason: 'missing-message-payload',
        });
        continue;
      }
""",
        "missing message payload",
        "reason: 'missing-message-payload'",
    )
    source_text = replace_once(
        source_text,
        "      const chatId = msg.key.remoteJid;\n",
        """      const content = unwrapMessageContent(msg.message);
      const timestampMs = getMessageTimestampMs(msg);
      if (type === 'append' && timestampMs > 0) {
        const ageMs = Date.now() - timestampMs;
        if (ageMs > APPEND_RECENT_WINDOW_MS) {
          logBridgeDiagnostic('messages.upsert.skipped', {
            ...summary,
            reason: 'append-too-old',
            ageMs,
          });
          continue;
        }
      }

      const chatId = msg.key.remoteJid;
      const editTargetMessageId = getEditTargetMessageId(msg.message);
      if (WHATSAPP_MODE === 'self-chat' && isSelfChatId(chatId) && consumePendingEdit(chatId, editTargetMessageId)) {
        logBridgeDiagnostic('messages.upsert.skipped', {
          ...summary,
          reason: 'agent-echo',
          echoType: 'edit',
          chatId,
          targetMessageId: editTargetMessageId,
        });
        continue;
      }
""",
        "content unwrap and append gate",
        "reason: 'append-too-old'",
    )
    source_text = replace_once(
        source_text,
        "        if (isGroup || chatId.includes('status')) continue;\n",
        """        if (isGroup || chatId.includes('status')) {
          logBridgeDiagnostic('messages.upsert.skipped', {
            ...summary,
            reason: 'fromMe-group-or-status',
            chatId,
          });
          continue;
        }
""",
        "group or status self-message",
        "reason: 'fromMe-group-or-status'",
    )
    source_text = replace_once(
        source_text,
        """          // Bot mode: separate number. ALL fromMe are echo-backs of our own replies — skip.
          continue;
""",
        """          // Bot mode: separate number. ALL fromMe are echo-backs of our own replies — skip.
          logBridgeDiagnostic('messages.upsert.skipped', {
            ...summary,
            reason: 'fromMe-bot-echo',
            chatId,
          });
          continue;
""",
        "bot echo skip",
        "reason: 'fromMe-bot-echo'",
    )
    source_text = replace_once_any(
        source_text,
        (
            """        const myNumber = (sock.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
        const chatNumber = chatId.replace(/@.*/, '');
        const isSelfChat = myNumber && chatNumber === myNumber;
""",
            """        const myNumber = (sock.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
        const myLid = (sock.user?.lid || '').replace(/:.*@/, '@').replace(/@.*/, '');
        const chatNumber = chatId.replace(/@.*/, '');
        const isSelfChat = (myNumber && chatNumber === myNumber) || (myLid && chatNumber === myLid);
""",
        ),
        """        const myNumber = getSelfNumber();
        const myLid = getSelfLid().replace(/@.*/, '');
        const chatNumber = chatId.replace(/@.*/, '');
        const isSelfChat = (myNumber && chatNumber === myNumber) || (myLid && chatNumber === myLid);
""",
        "self-chat identity",
        "const myLid = getSelfLid().replace(/@.*/, '');",
    )
    source_text = replace_once(
        source_text,
        "        if (!isSelfChat) continue;\n",
        """        if (!isSelfChat) {
          logBridgeDiagnostic('messages.upsert.skipped', {
            ...summary,
            reason: 'fromMe-not-self-chat',
            chatId,
            myNumber,
            myLid,
            chatNumber,
          });
          continue;
        }
""",
        "not self-chat skip",
        "reason: 'fromMe-not-self-chat'",
    )
    source_text = replace_once_any(
        source_text,
        (
            """      if (!msg.key.fromMe && ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(senderNumber)) {
        continue;
      }
""",
            """      if (!msg.key.fromMe && ALLOWED_USERS.length > 0) {
        const resolvedNumber = lidToPhone[senderNumber] || senderNumber;
        if (!ALLOWED_USERS.includes(resolvedNumber)) continue;
      }
""",
        ),
        """      if (!msg.key.fromMe && ALLOWED_USERS.length > 0) {
        const resolvedNumber =
          typeof lidToPhone !== 'undefined' && lidToPhone
            ? (lidToPhone[senderNumber] || senderNumber)
            : senderNumber;
        if (!ALLOWED_USERS.includes(resolvedNumber)) {
          logBridgeDiagnostic('messages.upsert.skipped', {
            ...summary,
            reason: 'unauthorized-sender',
            senderNumber,
            resolvedNumber,
            allowedUsers: ALLOWED_USERS,
          });
          continue;
        }
      }
""",
        "allowlist skip",
        "reason: 'unauthorized-sender'",
    )
    source_text = replace_once_variants(
        source_text,
        (
            (
                """      if (msg.message.conversation) {
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
""",
                """      if (content?.conversation) {
        body = content.conversation;
      } else if (content?.extendedTextMessage?.text) {
        body = content.extendedTextMessage.text;
      } else if (content?.imageMessage) {
        body = content.imageMessage.caption || '';
        hasMedia = true;
        mediaType = 'image';
      } else if (content?.videoMessage) {
        body = content.videoMessage.caption || '';
        hasMedia = true;
        mediaType = 'video';
      } else if (content?.audioMessage || content?.pttMessage) {
        hasMedia = true;
        mediaType = content.pttMessage ? 'ptt' : 'audio';
      } else if (content?.documentMessage) {
        body = content.documentMessage.caption || content.documentMessage.fileName || '';
        hasMedia = true;
        mediaType = 'document';
      }
""",
            ),
            (
                """      if (msg.message.conversation) {
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
          const filePath = path.join(IMAGE_CACHE_DIR, `img_${randomBytes(6).toString('hex')}${ext}`);
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
""",
                """      if (content?.conversation) {
        body = content.conversation;
      } else if (content?.extendedTextMessage?.text) {
        body = content.extendedTextMessage.text;
      } else if (content?.imageMessage) {
        body = content.imageMessage.caption || '';
        hasMedia = true;
        mediaType = 'image';
        try {
          const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
          const mime = content.imageMessage.mimetype || 'image/jpeg';
          const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
          const ext = extMap[mime] || '.jpg';
          mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
          const filePath = path.join(IMAGE_CACHE_DIR, `img_${randomBytes(6).toString('hex')}${ext}`);
          writeFileSync(filePath, buf);
          mediaUrls.push(filePath);
        } catch (err) {
          console.error('[bridge] Failed to download image:', err.message);
        }
      } else if (content?.videoMessage) {
        body = content.videoMessage.caption || '';
        hasMedia = true;
        mediaType = 'video';
      } else if (content?.audioMessage || content?.pttMessage) {
        hasMedia = true;
        mediaType = content.pttMessage ? 'ptt' : 'audio';
      } else if (content?.documentMessage) {
        body = content.documentMessage.caption || content.documentMessage.fileName || '';
        hasMedia = true;
        mediaType = 'document';
      }
""",
            ),
        ),
        "unwrapped content extraction",
        "content?.conversation",
    )
    source_text = replace_once_any(
        source_text,
        (
            "      if (!body && !hasMedia) continue;\n",
            """      // Ignore Hermes' own reply messages in self-chat mode to avoid loops.
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
""",
        ),
        """      const activeReplyPrefix = typeof REPLY_PREFIX !== 'undefined' ? REPLY_PREFIX : '⚕ *Hermes Agent*\\n────────────\\n';
      if (msg.key.fromMe && ((activeReplyPrefix && body.startsWith(activeReplyPrefix)) || (typeof recentlySentIds !== 'undefined' && recentlySentIds.has(msg.key.id)))) {
        logBridgeDiagnostic('messages.upsert.skipped', {
          ...summary,
          reason: 'agent-echo',
          chatId,
          senderNumber,
        });
        if (typeof WHATSAPP_DEBUG !== 'undefined' && WHATSAPP_DEBUG) {
          try { console.log(JSON.stringify({ event: 'ignored', reason: 'agent_echo', chatId, messageId: msg.key.id })); } catch {}
        }
        continue;
      }

      if (!body && !hasMedia) {
        logBridgeDiagnostic('messages.upsert.skipped', {
          ...summary,
          reason: summary.protocolType !== null ? 'protocol-message-no-content' : 'empty-body-no-media',
          chatId,
          senderNumber,
        });
        if (typeof WHATSAPP_DEBUG !== 'undefined' && WHATSAPP_DEBUG) {
          try {
            console.log(JSON.stringify({ event: 'ignored', reason: 'empty', chatId, messageKeys: Object.keys(msg.message || {}) }));
          } catch (err) {
            console.error('Failed to log empty message event:', err);
          }
        }
        continue;
      }
""",
        "empty body skip",
        "protocol-message-no-content",
    )
    source_text = replace_once(
        source_text,
        "      const event = {\n",
        """      if (!rememberMessageId(msg.key.id)) {
        logBridgeDiagnostic('messages.upsert.skipped', {
          ...summary,
          reason: 'duplicate-message-id',
        });
        continue;
      }

      const event = {
""",
        "duplicate message guard",
        "reason: 'duplicate-message-id'",
    )
    source_text = replace_once(
        source_text,
        "      messageQueue.push(event);\n",
        """      logBridgeDiagnostic('messages.upsert.accepted', {
        ...summary,
        chatId,
        senderNumber,
        isGroup,
        hasMedia,
        mediaType,
        bodyPreview: body.slice(0, 160),
        queueLengthBefore: messageQueue.length,
      });

      messageQueue.push(event);
""",
        "accepted event log",
        "messages.upsert.accepted",
    )
    source_text = replace_once(
        source_text,
        """      if (messageQueue.length > MAX_QUEUE_SIZE) {
        messageQueue.shift();
      }
""",
        """      if (messageQueue.length > MAX_QUEUE_SIZE) {
        messageQueue.shift();
      }

      logBridgeDiagnostic('messages.upsert.queued', {
        messageId: event.messageId,
        chatId: event.chatId,
        queueLength: messageQueue.length,
      });
""",
        "queued event log",
        "messages.upsert.queued",
    )
    source_text = replace_once(
        source_text,
        """  });
}

// HTTP server
const app = express();
""",
        """  });

  sock.ev.on('messages.update', (updates) => {
    for (const update of updates) {
      const summary = summarizeMessageUpdate(update);
      const chatId = getMessageUpdateChatId(update);
      const editedMessage = getEditedMessageUpdateContent(update);
      if (WHATSAPP_MODE !== 'self-chat' || !isSelfChatId(chatId) || !editedMessage) {
        continue;
      }
      const targetMessageId = getUpdateTargetMessageId(update);
      if (consumePendingEdit(chatId, targetMessageId)) {
        logBridgeDiagnostic('messages.update.skipped', {
          ...summary,
          reason: 'agent-echo',
          echoType: 'edit',
          chatId,
          targetMessageId,
        });
      }
    }
  });
}

// HTTP server
const app = express();
""",
        "messages.update edit echo handler",
        "messages.update.skipped",
    )
    source_text = replace_once(
        source_text,
        """app.get('/messages', (req, res) => {
  const msgs = messageQueue.splice(0, messageQueue.length);
  res.json(msgs);
});
""",
        """app.get('/messages', (req, res) => {
  const msgs = messageQueue.splice(0, messageQueue.length);
  if (msgs.length > 0) {
    logBridgeDiagnostic('messages.poll.drained', {
      count: msgs.length,
      messageIds: msgs.map((msg) => msg.messageId),
      queueLengthAfterDrain: messageQueue.length,
    });
  }
  res.json(msgs);
});
""",
        "/messages endpoint",
        "messages.poll.drained",
    )
    source_text = replace_once_any(
        source_text,
        (
            """    const prefixed = `⚕ *Hermes Agent*\\n────────────\\n${message}`;
    const key = { id: messageId, fromMe: true, remoteJid: chatId };
    await sock.sendMessage(chatId, { text: prefixed, edit: key });
    res.json({ success: true });
""",
            """    const key = { id: messageId, fromMe: true, remoteJid: chatId };
    await sock.sendMessage(chatId, { text: formatOutgoingMessage(message), edit: key });
    res.json({ success: true });
""",
        ),
        """    const key = { id: messageId, fromMe: true, remoteJid: chatId };
    if (WHATSAPP_MODE === 'self-chat') {
      rememberPendingEdit(chatId, messageId);
    }
    const sent = await sock.sendMessage(chatId, {
      text: typeof formatOutgoingMessage === 'function' ? formatOutgoingMessage(message) : `⚕ *Hermes Agent*\\n────────────\\n${message}`,
      edit: key,
    });
    rememberMessageId(sent?.key?.id);
    res.json({ success: true });
""",
        "edit echo tracking",
        "rememberMessageId(sent?.key?.id);",
    )
    return source_text


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: patch-whatsapp-bridge.py /path/to/bridge.js", file=sys.stderr)
        return 1

    target = Path(argv[1])
    source_text = target.read_text(encoding="utf-8")
    patched = patch_bridge(source_text)
    if patched != source_text:
        target.write_text(patched, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
