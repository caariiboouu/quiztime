/**
 * Routes for the online quiz:
 *   #/live              enter a room code
 *   #/live/join/ABCD    join room ABCD
 *   #/live/host         host console / presenter screen
 *   #/live/mascot       mascot preview
 *   #/live/flock        every duck variation in one scene (stress test)
 *   #/live/arena        shared practice arena: everyone who opens it gets a duck
 *   #/live/test         self-running debate & teams practice game, join by name
 */
export function isLiveHash(hash: string): boolean {
  return hash === "#/live" || hash.startsWith("#/live/");
}
