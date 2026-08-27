export default [
  {
    method: 'GET',
    path: '/yt-transcript/:videoId',
    handler: 'transcript.getTranscript',
    config: {
      policies: [],
    },
  },
];
