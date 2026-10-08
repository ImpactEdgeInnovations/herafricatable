export function gatheringSetup(values) {
  const fallback = values.format === 'in_person' ? 'in_person' : values.format === 'hybrid' ? 'hybrid' : values.videoLink?.trim() ? 'watch_video' : 'video_call';
  const kind = ['in_person', 'video_call', 'watch_video', 'hybrid'].includes(values.gatheringStyle) ? values.gatheringStyle : fallback;
  return {
    kind,
    format: kind === 'in_person' ? 'in_person' : kind === 'hybrid' ? 'hybrid' : 'virtual',
    onlineUrl: kind === 'video_call' || kind === 'hybrid' ? (values.onlineUrl || '').trim() : '',
    videoLink: kind === 'watch_video' ? (values.videoLink || '').trim() : '',
  };
}
