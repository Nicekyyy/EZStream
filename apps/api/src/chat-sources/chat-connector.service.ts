import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { defaultGoogleTtsVoiceName, resolveGoogleTtsVoiceName, sanitizeTtsText, CHAT_COMMANDS_CHANNEL, REALTIME_CHANNEL } from "@ezstream/shared";
import type { UnifiedChatMessage } from "@ezstream/shared";
import { Prisma, TtsJobStatus, WidgetActionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { QueuesService } from "../queues/queues.service.js";
import { ConfigService } from "@nestjs/config";
import { LiveEventsService } from "../live-events/live-events.service.js";

@Injectable()
export class ChatConnectorService implements OnModuleInit, OnModuleDestroy {
  private subscriber: any;
  private activeChats = new Map<string, { connectionId: string; overlayToken: string; disconnect: () => void | Promise<void> }>();
  private sourceViewerCounts = new Map<string, number>();
  private youtubeParserErrorHandlerInstalled = false;
  private lastTtsByCreator = new Map<string, number>();
  private googleTtsVoice: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: any,
    @Inject(QueuesService) private readonly queues: QueuesService,
    @Inject(LiveEventsService) private readonly liveEvents: LiveEventsService,
    private readonly config: ConfigService
  ) {
    this.googleTtsVoice = resolveGoogleTtsVoiceName(this.config.get<string>("GOOGLE_TTS_VOICE"), defaultGoogleTtsVoiceName);
  }

  async onModuleInit() {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(CHAT_COMMANDS_CHANNEL);
    this.subscriber.on("message", (_channel: string, message: string) => {
      void this.handleCommand(message);
    });

    // Auto-connect all active sources on startup
    void this.autoConnectActiveSources();
  }

  async onModuleDestroy() {
    for (const [id] of this.activeChats) {
      await this.disconnectChat(id);
    }
    await this.subscriber?.quit();
  }

  private async autoConnectActiveSources() {
    try {
      const activeSources = await this.prisma.chatSource.findMany({
        where: { isEnabled: true, status: "CONNECTED" },
        include: { overlay: true }
      });
      for (const source of activeSources) {
        if (source.overlay.isActive) {
          console.log(`[chat] Auto-reconnecting source: ${source.id} (${source.platform} - ${source.target})`);
          await this.connectChat(source.id, source.platform, source.target, source.overlay.token);
        }
      }
    } catch (error) {
      console.error("[chat] Auto connect error:", error);
    }
  }

  private async handleCommand(messageStr: string) {
    try {
      const command = JSON.parse(messageStr) as {
        action: string;
        chatSourceId: string;
        platform: string;
        target: string;
        overlayToken: string | null;
      };

      if (command.action === "connect") {
        await this.connectChat(command.chatSourceId, command.platform, command.target, command.overlayToken ?? "");
      } else if (command.action === "disconnect") {
        await this.disconnectChat(command.chatSourceId);
      }
    } catch (error) {
      console.error("[chat] Error handling chat command:", error);
    }
  }

  private async connectChat(chatSourceId: string, platform: string, target: string, overlayToken: string) {
    await this.disconnectChat(chatSourceId);
    if (platform === "TIKTOK") {
      void this.connectTikTok(chatSourceId, target, overlayToken);
    } else if (platform === "YOUTUBE") {
      void this.connectYouTube(chatSourceId, target, overlayToken);
    }
  }

  private async disconnectChat(chatSourceId: string) {
    const active = this.activeChats.get(chatSourceId);
    if (!active) return;
    this.activeChats.delete(chatSourceId);
    try {
      await active.disconnect();
      console.log(`[chat] Disconnected source: ${chatSourceId}`);
      void this.updateViewerCount(chatSourceId, active.overlayToken, 0);
    } catch (error) {
      console.error(`[chat] Disconnect error: ${error}`);
    }
  }

  // ─── TikTok Connector ──────────────────────────────────────────────────────

  private async connectTikTok(chatSourceId: string, target: string, overlayToken: string) {
    const requestId = Math.random().toString(36).slice(2);
    let lastError: unknown = null;
    this.activeChats.set(chatSourceId, { connectionId: requestId, overlayToken, disconnect: () => undefined });
    try {
      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import("tiktok-live-connector");
      if (!this.isActiveChatConnection(chatSourceId, requestId)) return;
      const username = target.replace(/^@/, "");

      for (const attempt of [
        { connectionId: `${requestId}:room`, connectWithUniqueId: false },
        { connectionId: `${requestId}:unique`, connectWithUniqueId: true }
      ]) {
        if (!this.activeChats.has(chatSourceId)) return;

        const tiktok = new TikTokLiveConnection(username, {
          processInitialData: false,
          fetchRoomInfoOnConnect: false,
          enableExtendedGiftInfo: false,
          connectWithUniqueId: attempt.connectWithUniqueId,
          wsClientHeaders: {
            Origin: "https://www.tiktok.com"
          }
        });

        this.activeChats.set(chatSourceId, {
          connectionId: attempt.connectionId,
          overlayToken,
          disconnect: async () => {
            await Promise.resolve(tiktok.disconnect()).catch(() => undefined);
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        });

        tiktok.on(WebcastEvent.CHAT, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          const msgText = this.tiktokMessageText(data);
          if (!msgText) return;
          const message: UnifiedChatMessage = {
            id: `tiktok-${data.msgId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}`,
            platform: "tiktok",
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            message: msgText,
            avatarUrl: this.resolveTikTokAvatarUrl(data.user),
            badges: [],
            timestamp: Date.now()
          };
          void this.publishChatMessage(chatSourceId, overlayToken, message);
        });

        tiktok.on(WebcastEvent.EMOTE, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          const msgText = (Array.isArray(data.emoteList) ? data.emoteList : []).map((e: any) => this.tiktokEmoteUrl(e)).filter(Boolean).join(" ");
          if (!msgText) return;
          const message: UnifiedChatMessage = {
            id: `tiktok-emote-${data.common?.msgId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}`,
            platform: "tiktok",
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            message: msgText,
            avatarUrl: this.resolveTikTokAvatarUrl(data.user),
            badges: [],
            timestamp: Date.now()
          };
          void this.publishChatMessage(chatSourceId, overlayToken, message);
        });

        (tiktok as any).on("roomUser", (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          const count = Number(data?.viewerCount);
          if (!isNaN(count)) {
            void this.updateViewerCount(chatSourceId, overlayToken, count);
          }
        });

        tiktok.on(ControlEvent.DISCONNECTED, () => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          console.log(`[chat] TikTok disconnected: @${username}`);
          this.activeChats.delete(chatSourceId);
          void this.updateChatSourceStatus(chatSourceId, "DISCONNECTED", overlayToken);
          void this.updateViewerCount(chatSourceId, overlayToken, 0);
        });

        try {
          await tiktok.connect();
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) {
            await Promise.resolve(tiktok.disconnect()).catch(() => undefined);
            return;
          }
          console.log(`[chat] TikTok connected: @${username} (${attempt.connectionId})`);

          await this.updateChatSourceStatus(chatSourceId, "CONNECTED", overlayToken);
          return;
        } catch (error) {
          lastError = error;
          const msg = error instanceof Error ? error.message : String(error);
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          if (!attempt.connectWithUniqueId && msg.includes("Unexpected server response: 200")) {
            this.activeChats.set(chatSourceId, { connectionId: `${requestId}:retry`, overlayToken, disconnect: () => undefined });
            await Promise.resolve(tiktok.disconnect()).catch(() => undefined);
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          break;
        }
      }
    } catch (error) {
      lastError = error;
    }

    if (!this.activeChats.has(chatSourceId)) return;
    const msg = lastError instanceof Error ? lastError.message : String(lastError ?? "Unknown TikTok connection error");
    console.error(`[chat] TikTok connect error: ${msg}`);
    this.activeChats.delete(chatSourceId);
    await this.updateChatSourceStatus(chatSourceId, "ERROR", overlayToken, msg);
    void this.updateViewerCount(chatSourceId, overlayToken, 0);
  }

  // ─── YouTube Connector ─────────────────────────────────────────────────────

  private async connectYouTube(chatSourceId: string, target: string, overlayToken: string) {
    const connectionId = Math.random().toString(36).slice(2);
    let run = true;
    this.activeChats.set(chatSourceId, {
      connectionId,
      overlayToken,
      disconnect: () => {
        run = false;
      }
    });

    try {
      console.log(`[chat] YouTube: connecting source=${chatSourceId} target="${target}"`);
      const { Innertube, Parser } = await import("youtubei.js");
      this.installYouTubeParserErrorHandler(Parser);
      console.log(`[chat] YouTube: creating Innertube instance...`);
      const yt = await Innertube.create();
      console.log(`[chat] YouTube: Innertube instance created`);

      let liveVideoId: string | null = null;
      const normalizedTarget = target.trim();

      const resolveChannelId = async (input: string) => {
        const channelHandle = input.replace(/^@/, "").replace(/https?:\/\/(www\.)?youtube\.com\/(@)?/i, "").split("/")[0].split("?")[0];
        console.log(`[chat] YouTube: resolving channel handle="${channelHandle}"`);
        if (channelHandle.startsWith("UC")) return channelHandle;

        const resolved = await yt.resolveURL(`https://www.youtube.com/@${channelHandle}`).catch((e: any) => { console.log(`[chat] YouTube: resolveURL failed: ${e.message}`); return null; });
        if (resolved?.payload?.browseId) {
          console.log(`[chat] YouTube: resolved browseId=${resolved.payload.browseId}`);
          return String(resolved.payload.browseId);
        }

        console.log(`[chat] YouTube: resolveURL failed, trying search...`);
        const search = await yt.search(input, { type: "channel" }).catch(() => null);
        const channelResult = (search?.results as any[] | undefined)?.find((item) => item?.type === "Channel" && item?.id);
        if (channelResult?.id) console.log(`[chat] YouTube: found channel via search: ${channelResult.id}`);
        return channelResult?.id ? String(channelResult.id) : null;
      };

      const findLiveVideoIdForChannel = async (channelId: string) => {
        console.log(`[chat] YouTube: looking for live streams on channel=${channelId}`);
        const channelPage = await yt.getChannel(channelId);
        const liveTab = await channelPage.getLiveStreams().catch(() => null);
        const videos = liveTab?.videos || [];
        console.log(`[chat] YouTube: found ${videos.length} videos in live tab`);

        const liveVideo = (videos as any[]).find((video) => video?.is_live);
        if (liveVideo?.id) {
          console.log(`[chat] YouTube: found live video: ${liveVideo.id}`);
          return String(liveVideo.id);
        }
        if (videos.length > 0 && (videos[0] as any)?.id) {
          console.log(`[chat] YouTube: using first video from live tab: ${(videos[0] as any).id}`);
          return String((videos[0] as any).id);
        }
        return null;
      };

      const findLiveVideoIdBySearch = async (query: string) => {
        console.log(`[chat] YouTube: searching for live video with query="${query}"`);
        const search = await yt.search(query, { type: "video", features: ["live"] }).catch(() => null);
        const liveVideo = (search?.results as any[] | undefined)?.find((item) => {
          const id = item?.video_id ?? item?.id;
          return id && (item?.is_live || item?.style === "VIDEO_STYLE_TYPE_LIVE_POST");
        });
        const id = liveVideo?.video_id ?? liveVideo?.id;
        if (id) console.log(`[chat] YouTube: found live video via search: ${id}`);
        return id ? String(id) : null;
      };

      const videoMatch = normalizedTarget.match(/(?:v=|live\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
      if (videoMatch) {
        liveVideoId = videoMatch[1];
        console.log(`[chat] YouTube: extracted video ID from URL: ${liveVideoId}`);
      } else if (/^[A-Za-z0-9_-]{11}$/.test(normalizedTarget)) {
        liveVideoId = normalizedTarget;
        console.log(`[chat] YouTube: using direct video ID: ${liveVideoId}`);
      } else {
        const channelId = await resolveChannelId(normalizedTarget);
        if (channelId) liveVideoId = await findLiveVideoIdForChannel(channelId);
        if (!liveVideoId) liveVideoId = await findLiveVideoIdBySearch(normalizedTarget);
      }

      if (!liveVideoId) throw new Error(`ไม่พบไลฟ์สตรีมที่กำลังออกอากาศสำหรับ: ${target}`);

      console.log(`[chat] YouTube: getting video info for: ${liveVideoId}`);
      const videoInfo = await yt.getInfo(liveVideoId);
      console.log(`[chat] YouTube: video title="${videoInfo.basic_info.title}" is_live=${videoInfo.basic_info.is_live} is_live_content=${videoInfo.basic_info.is_live_content}`);

      let livechat: any;
      try {
        livechat = videoInfo.getLiveChat();
      } catch (error: any) {
        const isLiveLike = videoInfo.basic_info.is_live || videoInfo.basic_info.is_live_content || videoInfo.basic_info.is_upcoming;
        if (!isLiveLike) throw new Error(`วิดีโอนี้ไม่ได้กำลังไลฟ์อยู่: ${liveVideoId}`);
        throw new Error(`ไม่สามารถเปิด YouTube Live Chat ได้: ${error.message}`);
      }

      console.log(`[chat] YouTube: live chat object obtained, starting polling for video: ${liveVideoId}`);
      await this.updateChatSourceStatus(chatSourceId, "CONNECTED", overlayToken);

      let chatItemCount = 0;
      livechat.on("chat-update", (action: any) => {
        if (!run || !this.isActiveChatConnection(chatSourceId, connectionId)) return;

        const isAddChat = (typeof action.is === "function" && action.is("AddChatItemAction")) ||
          action.type === "AddChatItemAction" ||
          action.constructor?.name === "AddChatItemAction";
        if (!isAddChat) return;

        const chatItem = action.item;
        if (!chatItem) return;

        chatItemCount++;
        
        // Match message schema and parse run emoji / text
        const messageText = this.youtubeMessageText(chatItem.message);
        if (!messageText) return;

        const author = chatItem.author;
        if (chatItemCount <= 3) {
          console.log(`[chat] YouTube: received message #${chatItemCount} from "${author?.name}" — "${messageText.slice(0, 80)}"`);
        }
        const message: UnifiedChatMessage = {
          id: `youtube-${chatItem.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}`,
          platform: "youtube",
          username: author?.id ?? "unknown",
          displayName: author?.name?.toString() ?? "unknown",
          message: messageText,
          avatarUrl: author?.thumbnails?.[0]?.url ?? undefined,
          badges: author?.badges?.map((b: any) => b.title).filter((t: any) => typeof t === "string") ?? [],
          timestamp: chatItem.timestamp ? Number(chatItem.timestamp) : Date.now()
        };
        void this.publishChatMessage(chatSourceId, overlayToken, message);
      });

      livechat.on("error", async (error: any) => {
        console.error(`[chat] YouTube chat error: ${error}`);
        if (this.isActiveChatConnection(chatSourceId, connectionId)) {
          await this.updateChatSourceStatus(chatSourceId, "ERROR", overlayToken, String(error?.message ?? error));
        }
      });

      let viewerInterval: NodeJS.Timeout | null = null;
      const pollViewerCount = async () => {
        if (!run || !this.isActiveChatConnection(chatSourceId, connectionId)) return;
        try {
          const info = await yt.getInfo(liveVideoId);
          let numericCount = 0;
          const originalViewCount = (info as any).primary_info?.view_count?.original_view_count;
          const viewCountText = (info as any).primary_info?.view_count?.view_count?.text;
          const basicViewers = (info.basic_info as any)?.viewers;
          const basicViewCount = info.basic_info?.view_count;

          if (originalViewCount !== undefined && originalViewCount !== null) {
            const num = parseInt(String(originalViewCount), 10);
            if (!isNaN(num)) numericCount = num;
          } else if (viewCountText) {
            const cleanText = String(viewCountText).replace(/,/g, "").match(/\d+/);
            if (cleanText) {
              const num = parseInt(cleanText[0], 10);
              if (!isNaN(num)) numericCount = num;
            }
          } else if (basicViewers !== undefined && basicViewers !== null) {
            const num = parseInt(String(basicViewers), 10);
            if (!isNaN(num)) numericCount = num;
          } else if (basicViewCount !== undefined && basicViewCount !== null) {
            const num = parseInt(String(basicViewCount), 10);
            if (!isNaN(num)) numericCount = num;
          }

          void this.updateViewerCount(chatSourceId, overlayToken, numericCount);
        } catch (err: any) {
          console.warn(`[chat] YouTube: failed to poll viewer count: ${err.message}`);
        }
      };

      void pollViewerCount();
      viewerInterval = setInterval(() => {
        void pollViewerCount();
      }, 30000);

      // Keep polling YouTube chat
      void livechat.start();
      console.log(`[chat] YouTube: livechat.start() called`);

      this.activeChats.set(chatSourceId, {
        connectionId,
        overlayToken,
        disconnect: async () => {
          run = false;
          if (viewerInterval) clearInterval(viewerInterval);
          console.log(`[chat] YouTube: disconnect requested for source=${chatSourceId}`);
          try {
            await livechat.stop();
          } catch (error) {
            console.warn(`[chat] YouTube: error stopping livechat: ${error}`);
          }
          void this.updateViewerCount(chatSourceId, overlayToken, 0);
        }
      });

    } catch (error: any) {
      console.error(`[chat] YouTube connect error: ${error.message}`);
      console.error(`[chat] YouTube connect stack: ${error.stack}`);
      if (this.isActiveChatConnection(chatSourceId, connectionId)) {
        this.activeChats.delete(chatSourceId);
        await this.updateChatSourceStatus(chatSourceId, "ERROR", overlayToken, error.message);
        void this.updateViewerCount(chatSourceId, overlayToken, 0);
      }
    }
  }

  // ─── Rules and Messages Execution ──────────────────────────────────────────

  private async publishChatMessage(chatSourceId: string, overlayToken: string, message: UnifiedChatMessage) {
    await this.redis.publish(
      REALTIME_CHANNEL,
      JSON.stringify({
        room: `overlay-token:${overlayToken}`,
        event: "chat.message",
        payload: message
      })
    );

    const source = await this.prisma.chatSource.findUnique({
      where: { id: chatSourceId },
      include: { overlay: true }
    });
    if (!source || !source.isEnabled || !source.overlay.isActive) return;

    const payload = {
      id: message.id,
      platform: message.platform,
      username: message.username,
      displayName: message.displayName,
      message: message.message,
      avatarUrl: message.avatarUrl,
      badges: message.badges ?? [],
      timestamp: message.timestamp,
      chatSourceId,
      overlayId: source.overlayId,
      overlayToken: source.overlay.token
    };

    await this.liveEvents.processEvent(source.creatorId, "live.chat.message", payload);
  }

  private async updateChatSourceStatus(id: string, status: string, overlayToken: string, errorMessage: string | null = null) {
    await this.prisma.chatSource.update({
      where: { id },
      data: { status: status as any, errorMessage, ...(status === "CONNECTED" ? { lastConnectedAt: new Date() } : {}) }
    }).catch(() => undefined);

    await this.redis.publish(
      REALTIME_CHANNEL,
      JSON.stringify({
        room: `overlay-token:${overlayToken}`,
        event: "chat-source.status",
        payload: { id, status, errorMessage }
      })
    );
  }



  private isActiveChatConnection(chatSourceId: string, connectionId: string) {
    return this.activeChats.get(chatSourceId)?.connectionId === connectionId;
  }

  private normalizeAvatarUrl(url: unknown) {
    if (typeof url !== "string" || !url.trim()) return undefined;
    const trimmed = url.trim();
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    return undefined;
  }

  private firstImageUrl(image: unknown) {
    if (!image || typeof image !== "object") return undefined;
    const value = image as { url?: unknown; urls?: unknown; mUrls?: unknown; urlList?: unknown; imageUrl?: unknown; thumbnails?: unknown };
    if (Array.isArray(value.thumbnails)) {
      const sorted = [...value.thumbnails].sort((a: any, b: any) => Number(b?.width ?? 0) - Number(a?.width ?? 0));
      const url = this.normalizeAvatarUrl(sorted[0]?.url);
      if (url) return url;
    }
    const candidates = [value.imageUrl, value.url, value.urls, value.mUrls, value.urlList];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        const url = candidate.map((u) => this.normalizeAvatarUrl(u)).find(Boolean);
        if (url) return url;
      } else {
        const url = this.normalizeAvatarUrl(candidate);
        if (url) return url;
      }
    }
    return undefined;
  }

  private resolveTikTokAvatarUrl(user: unknown) {
    if (!user || typeof user !== "object") return undefined;
    const value = user as {
      profilePictureUrl?: unknown;
      profilePicture?: unknown;
      profilePictureMedium?: unknown;
      profilePictureLarge?: unknown;
      avatarThumb?: unknown;
    };
    return (
      this.normalizeAvatarUrl(value.profilePictureUrl) ??
      this.firstImageUrl(value.profilePictureMedium) ??
      this.firstImageUrl(value.profilePicture) ??
      this.firstImageUrl(value.profilePictureLarge) ??
      this.firstImageUrl(value.avatarThumb)
    );
  }

  private tiktokEmoteUrl(emote: any) {
    const urlListUrl = (list: unknown) => {
      if (!Array.isArray(list)) return undefined;
      return list.map((u) => this.normalizeAvatarUrl(u)).find(Boolean);
    };
    return (
      this.normalizeAvatarUrl(emote?.image?.imageUrl) ??
      urlListUrl(emote?.image?.urlList) ??
      this.firstImageUrl(emote?.image) ??
      this.normalizeAvatarUrl(emote?.emote?.image?.imageUrl) ??
      urlListUrl(emote?.emote?.image?.urlList) ??
      this.firstImageUrl(emote?.emote?.image)
    );
  }

  private tiktokMessageText(data: any) {
    let message = typeof data?.comment === "string" ? data.comment : "";
    const emotes = Array.isArray(data?.emotes) ? data.emotes : [];
    for (const item of [...emotes].sort((a, b) => Number(b?.placeInComment ?? 0) - Number(a?.placeInComment ?? 0))) {
      const url = this.tiktokEmoteUrl(item);
      if (!url) continue;
      const index = Math.max(0, Math.min(message.length, Number(item?.placeInComment ?? message.length)));
      message = `${message.slice(0, index)} ${url} ${message.slice(index)}`.replace(/\s+/g, " ").trim();
    }
    return message;
  }

  private youtubeMessageText(message: any) {
    if (typeof message === "string") return message;
    if (Array.isArray(message?.runs)) {
      return message.runs
        .map((run: any) => {
          const emojiImage = run?.emoji?.image;
          const thumbnails = Array.isArray(emojiImage?.thumbnails) ? emojiImage.thumbnails : [];
          const images = thumbnails.length > 0 ? thumbnails : (Array.isArray(emojiImage) ? emojiImage : []);
          const bestImage = [...images].sort((a: any, b: any) => Number(b?.width ?? 0) - Number(a?.width ?? 0))[0];
          const emojiUrl = bestImage?.url ?? bestImage?.url_private ?? bestImage?.urlPrivate;
          const resolvedUrl = emojiUrl ?? this.normalizeAvatarUrl(emojiImage?.url) ?? this.firstImageUrl(emojiImage);
          return resolvedUrl ? ` ${String(resolvedUrl)} ` : String(run?.text ?? "");
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    }
    return message?.text ? String(message.text) : message?.toString?.() ?? "";
  }

  private installYouTubeParserErrorHandler(Parser: { setParserErrorHandler: (handler: (error: any) => void) => void }) {
    if (this.youtubeParserErrorHandlerInstalled) return;
    this.youtubeParserErrorHandlerInstalled = true;

    Parser.setParserErrorHandler((error: any) => {
      if (error?.error_type === "typecheck" && error?.classname === "HypeFanCreditsSectionView") return;
      const errorType = typeof error?.error_type === "string" ? error.error_type : "unknown";
      const classname = typeof error?.classname === "string" ? error.classname : "unknown";
      const cause = error?.error instanceof Error ? `: ${error.error.message}` : "";
      console.warn(`[chat] YouTube parser warning (${errorType}/${classname})${cause}`);
    });
  }

  private async updateViewerCount(chatSourceId: string, overlayToken: string, count: number) {
    this.sourceViewerCounts.set(chatSourceId, count);

    // Get the source details
    const source = await this.prisma.chatSource.findUnique({
      where: { id: chatSourceId }
    });
    if (!source) return;

    // Find all active VIEWER_COUNT_WIDGETs on the overlay
    const widgets = await this.prisma.widget.findMany({
      where: {
        overlayId: source.overlayId,
        type: "VIEWER_COUNT_WIDGET",
        isEnabled: true
      }
    });
    if (widgets.length === 0) return;

    // Get all chat sources on the overlay to sum the viewer counts
    const overlaySources = await this.prisma.chatSource.findMany({
      where: { overlayId: source.overlayId, isEnabled: true }
    });

    let youtube = 0;
    let tiktok = 0;

    for (const s of overlaySources) {
      const sCount = this.sourceViewerCounts.get(s.id) ?? 0;
      if (s.platform === "YOUTUBE") {
        youtube += sCount;
      } else if (s.platform === "TIKTOK") {
        tiktok += sCount;
      }
    }

    const total = youtube + tiktok;

    const state = { youtube, tiktok, total };

    for (const widget of widgets) {
      await this.prisma.widgetState.upsert({
        where: { widgetId: widget.id },
        update: { state },
        create: { widgetId: widget.id, state }
      });

      // Broadcast widget update to overlays
      await this.redis.publish(
        "ezstream:realtime",
        JSON.stringify({
          room: `overlay-token:${overlayToken}`,
          event: "widget.updated",
          payload: { widgetId: widget.id }
        })
      );
    }
  }
}
