import { Server } from 'socket.io';
import { agentService } from '../agent/index.js';
import { Message, Room, User } from '../models/index.js';

interface EkoMentionData {
  io: Server;
  roomId: string;
  messageContent: string;
  authorId: string;
  authorName: string;
  roomName: string;
}

/**
 * Handle Eko mention: get context, ask agent, post response
 */
export async function handleEkoMention(data: EkoMentionData) {
  const { io, roomId, messageContent, authorId, authorName, roomName } = data;

  try {
    // Get Eko user
    const ekoUser = await User.findOne({ username: 'eko' });
    if (!ekoUser) {
      console.error('[Eko] Eko user not found in database');
      return;
    }

    // Get recent messages from room for context (last 20 messages)
    const recentMessages = await Message.find({ roomId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('senderId', 'username displayName')
      .lean();

    // Format context for agent
    const context = recentMessages
      .reverse() // Oldest first
      .map((m: any) => {
        const sender = m.senderId;
        const senderName = sender?.displayName || sender?.username || 'Unknown';
        return `${senderName}: ${m.content || '[media]'}`;
      })
      .join('\n');

    // Build prompt for agent
    const prompt = `Tu es Eko, un assistant collaboratif dans l'app Organizer.
Room: "${roomName}"

Contexte récent:
${context}

Dernier message de ${authorName}: ${messageContent}

IMPORTANT - Analyse le contexte avant de répondre :
- Si on te PARLE DIRECTEMENT (2ème personne: "Eko, dis-moi...", "Eko peux-tu...") → utilise respond pour répondre
- Si on PARLE DE TOI (3ème personne: "Eko peut faire ça", "on a amélioré Eko") → N'utilise PAS respond. Tu peux stocker des mémoires (store_memory, store_self, store_goal) si tu apprends quelque chose d'intéressant, mais reste silencieux.

Si tu dois répondre, sois concis et utile.`;

    // Ask agent
    console.log(`[Eko] Processing mention from ${authorName} in ${roomName}`);
    const agentResponse = await agentService.ask(prompt);

    // Only post if agent decided to respond (non-empty response)
    if (!agentResponse.response || agentResponse.response.trim() === '') {
      console.log(`[Eko] Agent chose to observe silently (3rd person mention)`);
      return;
    }

    // Post Eko's response in the room
    const ekoMessage = new Message({
      roomId,
      senderId: ekoUser._id,
      type: 'text',
      content: agentResponse.response,
      status: 'sent',
      readBy: [],
      clientSource: 'api',
    });

    await ekoMessage.save();
    await ekoMessage.populate('senderId', 'username displayName status statusMessage isBot');

    // Update room's lastMessageAt
    await Room.findByIdAndUpdate(roomId, { lastMessageAt: new Date() });

    // Emit message to all clients
    const sender = ekoMessage.senderId as any;
    const room = await Room.findById(roomId);

    const payload = {
      from: ekoUser._id.toString(),
      fromName: sender?.displayName || 'Eko',
      roomName: room?.name || roomName,
      roomId: roomId,
      messageId: ekoMessage._id.toString(),
      preview: agentResponse.response.substring(0, 100),
    };

    io.to(`room:${roomId}`).emit('message:new', payload);

    console.log(`[Eko] Response posted in room ${roomName}`);
  } catch (error: any) {
    console.error('[Eko] Error handling mention:', error.message);
  }
}
