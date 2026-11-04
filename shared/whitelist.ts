export const WHITELIST_TASKS = [
  {
    id: "follow",
    title: "Follow Pitlane on X",
    detail: "Open the official profile",
  },
  {
    id: "like",
    title: "Like the pinned post",
    detail: "Open the campaign post",
  },
  {
    id: "repost",
    title: "Repost the pinned post",
    detail: "Share it with your crew",
  },
  {
    id: "quote",
    title: "Quote the pinned post",
    detail: "Tell your followers about Pitlane",
  },
] as const;
export type WhitelistTask = (typeof WHITELIST_TASKS)[number]["id"];
export type WhitelistLinks = Record<WhitelistTask, string>;
export type WhitelistConfig = {
  revision: number;
  state: "closed" | "open";
  links: WhitelistLinks;
};
export type WhitelistPublic = WhitelistConfig & {
  completed: WhitelistTask[];
  receipt: string | null;
  localPreview: boolean;
};
export const EMPTY_WHITELIST_LINKS: WhitelistLinks = {
  follow: "",
  like: "",
  repost: "",
  quote: "",
};

// Post IDs exceed JavaScript's safe integer range. Keep them as strings.
export function xPostId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let id = value.trim();
  if (validCampaignLink(id)) {
    id =
      new URL(id).pathname.match(/^\/(?:[\w]+|i)\/status\/(\d+)\/?$/)?.[1] ??
      "";
  }
  return /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= 18446744073709551615n
    ? id
    : null;
}

export function postIntentLinks(
  value: unknown,
): Omit<WhitelistLinks, "follow"> | null {
  const id = xPostId(value);
  if (!id) return null;
  return {
    like: `https://x.com/intent/like?tweet_id=${id}`,
    repost: `https://x.com/intent/retweet?tweet_id=${id}`,
    // The composer receives the original post URL; the visitor adds their comment.
    quote: `https://x.com/intent/tweet?url=${encodeURIComponent(`https://x.com/i/status/${id}`)}`,
  };
}

export function configuredPostId(links: WhitelistLinks): string {
  const ids = [links.like, links.repost, links.quote].map((link) => {
    if (!validCampaignLink(link)) return null;
    const url = new URL(link);
    if (["/intent/like", "/intent/retweet"].includes(url.pathname))
      return xPostId(url.searchParams.get("tweet_id"));
    if (url.pathname === "/intent/tweet")
      return xPostId(url.searchParams.get("url"));
    return xPostId(link);
  });
  return ids[0] && ids.every((id) => id === ids[0]) ? ids[0] : "";
}

export function validCampaignLink(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
        url.hostname,
      ) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname !== "/"
    );
  } catch {
    return false;
  }
}
