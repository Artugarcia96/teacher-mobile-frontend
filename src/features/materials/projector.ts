/** The teacher view and the projector window talk through `BroadcastChannel("sepia-proyectar-<materialId>")`. The
 *  teacher view owns the state and broadcasts it; the projector window forwards its key presses and shows only the
 *  state it receives. A projector window opened on its own owns its state until a teacher view speaks. Every message
 *  carries an increasing `seq`; a window ignores a message older than the last one it applied. Nothing but slide
 *  state crosses the channel: no student data can reach the projector. */
import type { Blank, Timer } from './presenter';

/** What the projector shows. `slide` is the id of the slide on screen (a backup slide included). */
export interface SharedState {
  lesson: number; slide: string; frame: number; blank: Blank; timer: Timer | null;
}

export type ProjectorMessage =
  | ({ type: 'state'; seq: number } & SharedState)
  | { type: 'key'; seq: number; key: string }
  | { type: 'hello'; seq: number }
  | { type: 'bye'; seq: number };

/** A message before it gets its `seq`. */
export type Unsent = ProjectorMessage extends infer M ? (M extends unknown ? Omit<M, 'seq'> : never) : never;

export type Role = 'teacher' | 'projector';

export interface Peer {
  role: Role;
  /** Owns the state: the teacher view always; a projector window until a teacher view speaks, and again after it
   *  closes. */
  owner: boolean;
  /** The `seq` of the last message applied. */
  last: number;
}

export interface Received {
  peer: Peer;
  /** A projector window that follows: the state to show. */
  show?: SharedState;
  /** A teacher view: a key the projector window forwarded, to apply as its own. */
  key?: string;
  /** Answer with the current state (a window said hello). */
  reply?: boolean;
}

export const channelName = (materialId: string) => `sepia-proyectar-${materialId}`;

export function startPeer(role: Role): Peer {
  return { role, owner: true, last: 0 };
}

/** A `seq` that increases across reloads of either window: the clock, and one more than the last when it repeats. */
export function nextSeq(last: number, now: number): number {
  return Math.max(now, last + 1);
}

export function receive(peer: Peer, msg: ProjectorMessage): Received {
  if (msg.type !== 'hello' && msg.seq <= peer.last) return { peer };
  const seen = { ...peer, last: msg.type === 'hello' ? peer.last : msg.seq };
  if (peer.role === 'teacher') {
    if (msg.type === 'hello') return { peer, reply: true };
    if (msg.type === 'key') return { peer: seen, key: msg.key };
    return { peer };
  }
  if (msg.type === 'state') {
    const { type: _t, seq: _s, ...state } = msg;
    return { peer: { ...seen, owner: false }, show: state };
  }
  if (msg.type === 'bye') return { peer: { ...seen, owner: true } };
  if (msg.type === 'hello' && peer.owner) return { peer, reply: true };
  return { peer };
}
