export function YoutubeIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" overflow="visible" {...props}>
      <title>YouTube</title>
      <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
      <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function TiktokIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" overflow="visible" {...props}>
      <title>TikTok</title>
      <path fill="#24f6f0" transform="translate(-0.4, -0.4)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.04.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 2.22-1.15 4.35-2.88 5.67-1.74 1.34-4.04 1.83-6.17 1.25-2.14-.58-3.92-2.14-4.71-4.16-.78-2.02-.37-4.39.95-6.09 1.32-1.72 3.49-2.7 5.63-2.67V14.5c-1.35.03-2.61.85-3.14 2.1-.53 1.25-.13 2.75.91 3.61 1.05.86 2.59 1.02 3.8.44 1.21-.58 1.95-1.92 1.94-3.26.03-4.88.02-9.77.03-14.66.02-1.11.02-2.22.02-3.33z" />
      <path fill="#ff0050" transform="translate(0.4, 0.4)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.04.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 2.22-1.15 4.35-2.88 5.67-1.74 1.34-4.04 1.83-6.17 1.25-2.14-.58-3.92-2.14-4.71-4.16-.78-2.02-.37-4.39.95-6.09 1.32-1.72 3.49-2.7 5.63-2.67V14.5c-1.35.03-2.61.85-3.14 2.1-.53 1.25-.13 2.75.91 3.61 1.05.86 2.59 1.02 3.8.44 1.21-.58 1.95-1.92 1.94-3.26.03-4.88.02-9.77.03-14.66.02-1.11.02-2.22.02-3.33z" />
      <path fill="#ffffff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.04.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 2.22-1.15 4.35-2.88 5.67-1.74 1.34-4.04 1.83-6.17 1.25-2.14-.58-3.92-2.14-4.71-4.16-.78-2.02-.37-4.39.95-6.09 1.32-1.72 3.49-2.7 5.63-2.67V14.5c-1.35.03-2.61.85-3.14 2.1-.53 1.25-.13 2.75.91 3.61 1.05.86 2.59 1.02 3.8.44 1.21-.58 1.95-1.92 1.94-3.26.03-4.88.02-9.77.03-14.66.02-1.11.02-2.22.02-3.33z" />
    </svg>
  );
}

export function TwitchIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" overflow="visible" {...props}>
      <title>Twitch</title>
      <path fill="#9146FF" d="M6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0H6z" />
      <path fill="#ffffff" fillRule="evenodd" clipRule="evenodd" d="M6.857 1.714h13.714v9.429l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714zm4.714 3h1.715v5.143h-1.715V4.714zm4.715 0h1.714v5.143h-1.714V4.714z" />
    </svg>
  );
}

export function EzstreamLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img 
      src="/logo.svg" 
      alt="EZStream Logo" 
      className={className} 
    />
  );
}

export function CopyIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  );
}

export function CheckIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

export function ExternalLinkIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}
