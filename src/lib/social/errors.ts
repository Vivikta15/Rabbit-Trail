// A post to one channel did not go through. The message is safe to print: it never contains a key, password or webhook.
export class SocialPostError extends Error {}
