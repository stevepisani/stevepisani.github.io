// Walking keeps pace with elapsed frame time using bounded physics steps. A slow render must
// not turn a three-second approach into a minute, nor let one large step tunnel through props.
export function advanceWalking(player,seconds,interrupted=()=>false) {
  let remaining=Math.max(0,Math.min(.25,seconds));
  while(remaining>1e-8 && !interrupted()) {
    const step=Math.min(.05,remaining);player.update(step);remaining-=step;
  }
}
