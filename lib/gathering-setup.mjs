export function gatheringSetup(values) {
  if (values.gatheringStyle === 'online') {
    const link = (values.onlineUrl || '').trim();
    let youtube = false;
    try { youtube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(new URL(link).hostname); } catch {}
    return {kind: youtube ? 'watch_video' : 'video_call', format: 'virtual', onlineUrl: youtube ? '' : link, videoLink: youtube ? link : ''};
  }
  const fallback = values.format === 'in_person' ? 'in_person' : values.format === 'hybrid' ? 'hybrid' : values.videoLink?.trim() ? 'watch_video' : 'video_call';
  const kind = ['in_person', 'video_call', 'watch_video', 'hybrid'].includes(values.gatheringStyle) ? values.gatheringStyle : fallback;
  return {
    kind,
    format: kind === 'in_person' ? 'in_person' : kind === 'hybrid' ? 'hybrid' : 'virtual',
    onlineUrl: kind === 'video_call' || kind === 'hybrid' ? (values.onlineUrl || '').trim() : '',
    videoLink: kind === 'watch_video' ? (values.videoLink || '').trim() : '',
  };
}
