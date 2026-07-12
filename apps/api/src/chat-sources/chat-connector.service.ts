import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { defaultGoogleTtsVoiceName, resolveGoogleTtsVoiceName, sanitizeTtsText, CHAT_COMMANDS_CHANNEL, REALTIME_CHANNEL } from "@ezstream/shared";
import type { UnifiedChatMessage } from "@ezstream/shared";
import { Prisma, TtsJobStatus, WidgetActionStatus, type ChatSource, type Overlay } from "@prisma/client";
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
  private googleTtsVoice!: string;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private twitchGlobalBadges: any[] = [];
  // Chat messages arrive many times per second; don't hit SQLite for the same
  // chat source on every one of them.
  private chatSourceCache = new Map<string, { source: (ChatSource & { overlay: Overlay }) | null; expiresAt: number }>();
  private readonly chatSourceCacheTtlMs = 5000;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: any,
    @Inject(QueuesService) private readonly queues: QueuesService,
    @Inject(LiveEventsService) private readonly liveEvents: LiveEventsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) { }

  async onModuleInit() {
    this.googleTtsVoice = resolveGoogleTtsVoiceName(this.config.get<string>("GOOGLE_TTS_VOICE"), defaultGoogleTtsVoiceName);
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(CHAT_COMMANDS_CHANNEL);
    this.subscriber.on("message", (_channel: string, message: string) => {
      void this.handleCommand(message);
    });
    this.subscriber.on("error", (error: any) => {
      console.error("[chat] Redis subscriber error:", error);
    });

    // Auto-connect all active sources on startup and poll for disconnected sources
    void this.autoConnectActiveSources();
    this.reconnectInterval = setInterval(() => {
      void this.autoConnectActiveSources();
    }, 30000);

    void this.fetchTwitchGlobalBadges();
  }

  private async fetchTwitchGlobalBadges() {
    try {
      const res = await fetch("https://api.ivr.fi/v2/twitch/badges/global");
      if (res.ok) {
        this.twitchGlobalBadges = await res.json();
        console.log(`[chat] Fetched Twitch global badges (${this.twitchGlobalBadges.length} sets)`);
      }
    } catch (err) {
      console.warn(`[chat] Failed to fetch Twitch global badges: ${err}`);
    }
  }

  private async fetchTwitchChannelBadges(channel: string) {
    try {
      const res = await fetch(`https://api.ivr.fi/v2/twitch/badges/channel?login=${channel}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn(`[chat] Failed to fetch Twitch channel badges for ${channel}: ${err}`);
    }
    return [];
  }

  async onModuleDestroy() {
    if (this.reconnectInterval) clearInterval(this.reconnectInterval);
    for (const [id] of this.activeChats) {
      await this.disconnectChat(id);
    }
    await this.subscriber?.quit();
  }

  private async autoConnectActiveSources() {
    try {
      const activeSources = await this.prisma.chatSource.findMany({
        where: { isEnabled: true },
        include: { overlay: true }
      });
      for (const source of activeSources) {
        if (!source.overlay.isActive) continue;
        const isActive = this.activeChats.has(source.id);
        if (!isActive && (source.status === "CONNECTED" || source.status === "DISCONNECTED" || source.status === "ERROR")) {
          console.log(`[chat] Auto-connecting source: ${source.id} (${source.platform} - ${source.target})`);
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
    } else if (platform === "TWITCH") {
      void this.connectTwitch(chatSourceId, target, overlayToken);
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
      const { TikTokLiveConnection, WebcastEvent, ControlEvent, MemberMessageAction } = await import("tiktok-live-connector");
      if (!this.isActiveChatConnection(chatSourceId, requestId)) return;
      const username = target.replace(/^@/, "");

      for (const attempt of [
        { connectionId: `${requestId}:room`, connectWithUniqueId: false },
        { connectionId: `${requestId}:unique`, connectWithUniqueId: true }
      ]) {
        if (!this.activeChats.has(chatSourceId)) return;

        const signApiKey = this.config.get<string>("TIKTOK_SIGN_API_KEY");
        const tiktok = new TikTokLiveConnection(username, {
          processInitialData: false,
          fetchRoomInfoOnConnect: false,
          enableExtendedGiftInfo: true,
          connectWithUniqueId: attempt.connectWithUniqueId,
          signApiKey: signApiKey || undefined,
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
            id: `tiktok-${data.common?.msgId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}`,
            platform: "tiktok",
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            message: msgText,
            avatarUrl: this.resolveTikTokAvatarUrl(data.user),
            badges: this.resolveTikTokBadges(data.user, data),
            timestamp: Date.now()
          };
          void this.publishChatMessage(chatSourceId, overlayToken, message);
        });

        (tiktok as any).on("error", (error: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          console.error(`[chat] TikTok connection error event: ${error}`);
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
            badges: this.resolveTikTokBadges(data.user, data),
            timestamp: Date.now()
          };
          void this.publishChatMessage(chatSourceId, overlayToken, message);
        });

        tiktok.on(WebcastEvent.GIFT, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          const isStreakable = data.giftDetails?.giftType === 1;
          if (isStreakable && !data.repeatEnd) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.gift.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            avatarUrl: this.resolveTikTokAvatarUrl(data.user),
            giftName: data.giftDetails?.giftName,
            giftId: data.giftId,
            repeatCount: data.repeatCount ?? 1,
            coins: (data.giftDetails?.diamondCount ?? 0) * (data.repeatCount ?? 1)
          });
        });

        tiktok.on(WebcastEvent.FOLLOW, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.follow.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            avatarUrl: this.resolveTikTokAvatarUrl(data.user)
          });
        });

        tiktok.on(WebcastEvent.SHARE, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.share.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown"
          });
        });

        tiktok.on(WebcastEvent.LIKE, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.like.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            likeCount: data.likeCount ?? 1,
            totalLikeCount: data.totalLikeCount ?? 0
          });
        });

        tiktok.on(WebcastEvent.MEMBER, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          if (data.action !== MemberMessageAction.SUBSCRIBED) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.subscribe.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown"
          });
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
    let viewerInterval: NodeJS.Timeout | null = null;
    this.activeChats.set(chatSourceId, {
      connectionId,
      overlayToken,
      disconnect: () => {
        run = false;
        if (viewerInterval) clearInterval(viewerInterval);
      }
    });

    try {
      console.log(`[chat] YouTube: connecting source=${chatSourceId} target="${target}"`);
      const { Innertube, Parser, Log } = await import("youtubei.js");
      Log.setLevel(Log.Level.ERROR);
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
          badges: author?.badges?.map((b: any) => {
            const label = b?.title || b?.tooltip || "Badge";
            let iconUrl = b?.custom_thumbnail?.[0]?.url || b?.metadata?.image?.thumbnails?.[0]?.url;
            if (b?.icon_type) {
              const symbolMap: Record<string, string> = {
                'MODERATOR': 'build',
                'OWNER': 'person',
                'VERIFIED': 'check_circle'
              };
              const symbol = symbolMap[b.icon_type] || b.icon_type.toLowerCase();
              iconUrl = `https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/${symbol}/default/24px.svg`;
            }
            return { label: String(label), url: iconUrl ? String(iconUrl) : undefined };
          }).filter((b: any) => b.label) ?? [],
          timestamp: chatItem.timestamp ? Number(chatItem.timestamp) : Date.now()
        };
        void this.publishChatMessage(chatSourceId, overlayToken, message);
      });

      livechat.on("error", async (error: any) => {
        console.error(`[chat] YouTube chat error: ${error}`);
        if (this.isActiveChatConnection(chatSourceId, connectionId)) {
          if (viewerInterval) clearInterval(viewerInterval);
          this.activeChats.delete(chatSourceId);
          await this.updateChatSourceStatus(chatSourceId, "ERROR", overlayToken, String(error?.message ?? error));
          void this.updateViewerCount(chatSourceId, overlayToken, 0);
        }
      });


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
      Promise.resolve(livechat.start()).catch((error: any) => {
        console.error(`[chat] YouTube livechat.start() failed: ${error?.message ?? error}`);
      });
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
        if (viewerInterval) clearInterval(viewerInterval);
        this.activeChats.delete(chatSourceId);
        await this.updateChatSourceStatus(chatSourceId, "ERROR", overlayToken, error.message);
        void this.updateViewerCount(chatSourceId, overlayToken, 0);
      }
    }
  }

  // ─── Twitch Connector ────────────────────────────────────────────────────────

  private async connectTwitch(chatSourceId: string, target: string, overlayToken: string) {
    const connectionId = Date.now().toString();
    const attempt = { connectionId };
    this.activeChats.set(chatSourceId, {
      connectionId,
      overlayToken,
      disconnect: async () => { } // stub until connected
    });

    await this.updateChatSourceStatus(chatSourceId, "CONNECTING", overlayToken);

    try {
      const channel = target.replace(/^@/, "").trim().toLowerCase();
      if (!channel) throw new Error("Invalid Twitch channel");

      if (this.twitchGlobalBadges.length === 0) {
        await this.fetchTwitchGlobalBadges();
      }

      const tmi = await import("tmi.js");
      const client = new tmi.Client({
        channels: [channel],
      });

      let run = true;
      let viewerInterval: NodeJS.Timeout | null = null;
      let channelBadges = await this.fetchTwitchChannelBadges(channel);

      const getTwitchBadge = (key: string, version: string) => {
        const cSet = channelBadges.find((b: any) => b.set_id === key);
        const cVer = cSet?.versions?.find((v: any) => v.id === version);
        if (cVer) return { label: cVer.title, url: cVer.image_url_4x || cVer.image_url_2x || cVer.image_url_1x };

        const gSet = this.twitchGlobalBadges.find((b: any) => b.set_id === key);
        const gVer = gSet?.versions?.find((v: any) => v.id === version);
        if (gVer) return { label: gVer.title, url: gVer.image_url_4x || gVer.image_url_2x || gVer.image_url_1x };

        return { label: key };
      };

      client.on("message", (channel, tags, message, self) => {
        if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;

        let parsedMessage = message;
        if (tags.emotes) {
          const chars = Array.from(message);
          const replacements: { start: number; end: number; id: string }[] = [];
          for (const [id, positions] of Object.entries(tags.emotes)) {
            for (const pos of (positions as string[])) {
              const [start, end] = pos.split("-").map(Number);
              replacements.push({ start, end, id });
            }
          }
          replacements.sort((a, b) => b.start - a.start);
          for (const { start, end, id } of replacements) {
            const url = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
            chars.splice(start, end - start + 1, `<img src="${url}">`);
          }
          parsedMessage = chars.join("");
        }

        const twitchBadges = tags.badges ? Object.keys(tags.badges).map(key => getTwitchBadge(key, (tags.badges as any)[key])) : [];
        const unifiedMessage: UnifiedChatMessage = {
          id: tags.id ?? `twitch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          platform: "twitch",
          username: tags.username ?? "unknown",
          displayName: tags["display-name"] ?? tags.username ?? "unknown",
          message: parsedMessage,
          avatarUrl: undefined, // tmi.js doesn't provide avatar URL by default
          badges: twitchBadges,
          timestamp: Date.now()
        };
        void this.publishChatMessage(chatSourceId, overlayToken, unifiedMessage);
      });

      client.on("disconnected", () => {
        if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
        console.log(`[chat] Twitch disconnected: ${channel}`);
        this.activeChats.delete(chatSourceId);
        void this.updateChatSourceStatus(chatSourceId, "DISCONNECTED", overlayToken);
        void this.updateViewerCount(chatSourceId, overlayToken, 0);
        if (viewerInterval) clearInterval(viewerInterval);
      });

      (client as any).on("error", (error: any) => {
        if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
        console.error(`[chat] Twitch connection error event: ${error}`);
      });

      await client.connect();

      if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) {
        Promise.resolve(client.disconnect()).catch(() => undefined);
        return;
      }

      console.log(`[chat] Twitch connected: ${channel} (${attempt.connectionId})`);
      await this.updateChatSourceStatus(chatSourceId, "CONNECTED", overlayToken);

      const pollViewerCount = async () => {
        if (!run || !this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
        try {
          const res = await fetch(`https://decapi.me/twitch/viewercount/${channel}`);
          if (!res.ok) return;
          const text = await res.text();
          const count = parseInt(text, 10);
          if (!isNaN(count)) {
            void this.updateViewerCount(chatSourceId, overlayToken, count);
          }
        } catch (err: any) {
          console.warn(`[chat] Twitch: failed to poll viewer count: ${err.message}`);
        }
      };

      void pollViewerCount();
      viewerInterval = setInterval(() => {
        void pollViewerCount();
      }, 30000);

      this.activeChats.set(chatSourceId, {
        connectionId,
        overlayToken,
        disconnect: async () => {
          run = false;
          if (viewerInterval) clearInterval(viewerInterval);
          console.log(`[chat] Twitch: disconnect requested for source=${chatSourceId}`);
          await Promise.resolve(client.disconnect()).catch(() => undefined);
          void this.updateViewerCount(chatSourceId, overlayToken, 0);
        }
      });
    } catch (error: any) {
      console.error(`[chat] Twitch connect error: ${error.message}`);
      if (this.isActiveChatConnection(chatSourceId, connectionId)) {
        this.activeChats.delete(chatSourceId);
        await this.updateChatSourceStatus(chatSourceId, "ERROR", overlayToken, error.message);
        void this.updateViewerCount(chatSourceId, overlayToken, 0);
      }
    }
  }

  // ─── Rules and Messages Execution ──────────────────────────────────────────

  private async getChatSource(chatSourceId: string) {
    const cached = this.chatSourceCache.get(chatSourceId);
    if (cached && cached.expiresAt > Date.now()) return cached.source;
    const source = await this.prisma.chatSource.findUnique({
      where: { id: chatSourceId },
      include: { overlay: true }
    });
    this.chatSourceCache.set(chatSourceId, { source, expiresAt: Date.now() + this.chatSourceCacheTtlMs });
    return source;
  }

  private async processTikTokEvent(chatSourceId: string, overlayToken: string, eventType: string, payload: Record<string, unknown>) {
    // Callers fire-and-forget this; an uncaught rejection here would take the process down.
    try {
      const source = await this.getChatSource(chatSourceId);
      if (!source) return;
      await this.liveEvents.processEvent(source.creatorId, eventType, {
        ...payload,
        platform: "tiktok",
        overlayId: source.overlayId,
        overlayToken
      });
    } catch (error) {
      console.error(`[chat] Error processing TikTok event ${eventType}: ${error}`);
    }
  }

  private async publishChatMessage(chatSourceId: string, overlayToken: string, message: UnifiedChatMessage) {
    try {
      const truncatedMessage = {
        ...message,
        username: message.username.slice(0, 100),
        displayName: message.displayName.slice(0, 100),
        message: message.message.slice(0, 1000)
      };

      await this.redis.publish(
        REALTIME_CHANNEL,
        JSON.stringify({
          room: `overlay-token:${overlayToken}`,
          event: "chat.message",
          payload: truncatedMessage
        })
      );

      const source = await this.getChatSource(chatSourceId);
      if (!source || !source.isEnabled || !source.overlay.isActive) return;

      const payload = {
        id: truncatedMessage.id,
        platform: truncatedMessage.platform,
        username: truncatedMessage.username,
        displayName: truncatedMessage.displayName,
        message: truncatedMessage.message,
        avatarUrl: truncatedMessage.avatarUrl,
        badges: truncatedMessage.badges ?? [],
        timestamp: truncatedMessage.timestamp,
        chatSourceId,
        overlayId: source.overlayId,
        overlayToken: source.overlay.token
      };

      await this.liveEvents.processEvent(source.creatorId, "live.chat.message", payload);
    } catch (error) {
      console.error(`[chat] Error publishing chat message: ${error}`);
    }
  }

  private async updateChatSourceStatus(id: string, status: string, overlayToken: string, errorMessage: string | null = null) {
    try {
      await this.prisma.chatSource.update({
        where: { id },
        data: { status: status as any, errorMessage, ...(status === "CONNECTED" ? { lastConnectedAt: new Date() } : {}) }
      });

      await this.redis.publish(
        REALTIME_CHANNEL,
        JSON.stringify({
          room: `overlay-token:${overlayToken}`,
          event: "chat-source.status",
          payload: { id, status, errorMessage }
        })
      );
    } catch (error) {
      console.error(`[chat] Error updating chat source status: ${error}`);
    }
  }



  private isActiveChatConnection(chatSourceId: string, connectionId: string) {
    return this.activeChats.get(chatSourceId)?.connectionId === connectionId;
  }

  private normalizeAvatarUrl(url: unknown) {
    if (typeof url !== "string" || !url.trim()) return undefined;
    const trimmed = url.trim();
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("http://")) return `https${trimmed.slice(4)}`;
    if (trimmed.startsWith("https://")) return trimmed;
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

  private extractBadgeUrls(obj: any): string[] {
    const urls: string[] = [];
    const visited = new Set();
    
    const traverse = (o: any) => {
      if (!o || typeof o !== "object") return;
      if (visited.has(o)) return;
      visited.add(o);

      if (Array.isArray(o)) {
        o.forEach(traverse);
        return;
      }
      
      const url = this.firstImageUrl(o);
      if (url) {
        urls.push(url);
      }
      
      // If no direct URL, search child properties
      for (const key of Object.keys(o)) {
        // Skip some obvious non-badge object properties if needed, but safe to traverse
        traverse(o[key]);
      }
    };
    
    traverse(obj);
    return [...new Set(urls)];
  }

  private resolveTikTokBadges(user: any, data?: any) {
    if (!user && !data) return [];
    
    const u = user || {};
    const d = data || {};

    const list1 = Array.isArray(u.badgeImageList) ? u.badgeImageList : Array.isArray(d.badgeImageList) ? d.badgeImageList : [];
    const list2 = Array.isArray(u.mediaBadgeImageList) ? u.mediaBadgeImageList : Array.isArray(d.mediaBadgeImageList) ? d.mediaBadgeImageList : [];
    const list3 = Array.isArray(u.badges) ? u.badges : Array.isArray(d.badges) ? d.badges : [];
    const list4 = Array.isArray(u.userBadges) ? u.userBadges : Array.isArray(d.userBadges) ? d.userBadges : [];
    const list5 = Array.isArray(u.newUserBadges) ? u.newUserBadges : Array.isArray(d.newUserBadges) ? d.newUserBadges : [];
    
    const allBadgeObjects = [...list1, ...list2, ...list3, ...list4, ...list5];
    const urls = this.extractBadgeUrls(allBadgeObjects);
    
    return urls.map(url => ({ label: "Badge", url }));
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
      this.firstImageUrl(emote?.emote?.image) ??
      this.firstImageUrl(emote?.emote) ??
      this.firstImageUrl(emote)
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
    try {
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
      let twitch = 0;

      for (const s of overlaySources) {
        const sCount = this.sourceViewerCounts.get(s.id) ?? 0;
        if (s.platform === "YOUTUBE") {
          youtube += sCount;
        } else if (s.platform === "TIKTOK") {
          tiktok += sCount;
        } else if (s.platform === "TWITCH") {
          twitch += sCount;
        }
      }

      const total = youtube + tiktok + twitch;

      const state = { youtube, tiktok, twitch, total };

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
    } catch (error) {
      console.error(`[chat] Error updating viewer count: ${error}`);
    }
  }
}
