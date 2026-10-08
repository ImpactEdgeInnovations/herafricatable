export function gatheringSetup(values) {
  const kind = values.gatheringStyle || (values.format === 'in_person' ? 'in_person' : values.format === 'hybrid' ? 'hybrid' : values.videoLink?.trim() ? 'watch_video' : 'video_call');
  return {
    kind,
    format: kind === 'in_person' ? 'in_person' : kind === 'hybrid' ? 'hybrid' : 'virtual',
    onlineUrl: kind === 'video_call' || kind === 'hybrid' ? (values.onlineUrl || '').trim() : '',
    videoLink: kind === 'watch_video' ? (values.videoLink || '').trim() : '',
  };
}
