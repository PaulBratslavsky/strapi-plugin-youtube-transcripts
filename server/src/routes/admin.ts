export default [
  {
    method: 'GET',
    path: '/yt-transcript/:videoId',
    handler: 'transcript.getTranscript',
    config: {
      // Gated on the same action that gates the fetchTranscript tool. This
      // route was previously open to any authenticated admin regardless of
      // role, which meant the permission existed but nothing consulted it.
      policies: [
        {
          name: 'admin::hasPermissions',
          config: { actions: ['plugin::youtube-transcripts.tool.fetch-transcript'] },
        },
      ],
    },
  },
];
