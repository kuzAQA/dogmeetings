// Native motion only. Navigation and form state remain in app.jsx.
export const tabOrder = ['nearby', 'plans', 'pets'];
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function directionFor(from, to, back) {
 const a = tabOrder.indexOf(from), b = tabOrder.indexOf(to);
 return a >= 0 && b >= 0 && a !== b ? Math.sign(b - a) : back ? -1 : 1;
}

export function fadeIn(element, keyboard = false) {
 if (!element?.animate || keyboard) return;
 element.animate([{opacity: 0}, {opacity: 1}], {
  duration: reducedMotion() ? 100 : 120, easing: token('--ease-out')
 });
}

export async function closeSheet(element, keyboard = false) {
 if (!element) return;
 if (!keyboard && element.animate) {
  const style = getComputedStyle(element);
  const from = {opacity: style.opacity, transform: style.transform};
  element.getAnimations().forEach(animation => animation.cancel());
  element.classList.add('is-closing');
  const animation = element.animate([from, {
   opacity: reducedMotion() ? 0 : 1,
   transform: reducedMotion() ? 'none' : 'translateY(100%)'
  }], {duration: reducedMotion() ? 100 : 200, easing: token('--ease-out'), fill: 'forwards'});
  await animation.finished.catch(() => {});
 }
}

export function startSheetDrag(event, element, dismiss) {
 if (!element || event.button !== 0 || element.dataset.dragging) return;
 const grip = event.currentTarget?.matches?.('.sheet-grip') ? event.currentTarget : event.target.closest?.('.sheet-grip');
 if (!grip) return;
 const pointerId = event.pointerId;
 const startY = event.clientY;
 const startTime = performance.now();
 let distance = 0;
 element.dataset.dragging = 'true';
 element.getAnimations().forEach(animation => animation.cancel());
 element.style.transition = 'none';
 grip.setPointerCapture(pointerId);

 const move = next => {
  if (next.pointerId !== pointerId) return;
  const delta = next.clientY - startY;
  distance = delta < 0 ? delta * .12 : delta;
  element.style.transform = `translateY(${distance}px)`;
 };
 const finish = (next, cancelled = false) => {
  if (next.pointerId !== pointerId) return;
  grip.removeEventListener('pointermove', move);
  grip.removeEventListener('pointerup', finish);
  grip.removeEventListener('pointercancel', cancel);
  if (grip.hasPointerCapture(pointerId)) grip.releasePointerCapture(pointerId);
  delete element.dataset.dragging;
  element.style.transition = '';
  const velocity = distance / Math.max(performance.now() - startTime, 1);
  if (!cancelled && (distance >= Math.min(96, element.offsetHeight * .2) || (distance > 24 && velocity > .5))) {
   dismiss();
   return;
  }
  const animation = element.animate([
   {transform: `translateY(${distance}px)`},
   {transform: 'translateY(0)'}
  ], {duration: reducedMotion() ? 100 : 220, easing: token('--ease-out')});
  element.style.transform = '';
  animation.finished.catch(() => {});
 };
 const cancel = next => finish(next, true);
 grip.addEventListener('pointermove', move);
 grip.addEventListener('pointerup', finish);
 grip.addEventListener('pointercancel', cancel);
}

if (typeof document !== 'undefined') document.addEventListener('pointerdown', event => {
 const grip = event.target.closest?.('.sheet-grip');
 if (!grip) return;
 const sheet = grip.closest('dialog');
 const close = sheet?.querySelector('.sheet-header button');
 if (!close || close.disabled) return;
 startSheetDrag(event, sheet, () => close.click());
});

let activeTransition;
export function skipPageTransition() { activeTransition?.skipTransition(); }

export async function transitionPage(update, {direction, photoId, keyboard}) {
 skipPageTransition();
 if (!document.startViewTransition || keyboard) { update(); return; }
 if (reducedMotion()) { update(); fadeIn(document.querySelector('main')); return; }
 const root = document.documentElement;
 root.dataset.viewTransition = 'active';
 root.dataset.motionDirection = direction < 0 ? 'back' : 'forward';
 const photo = () => photoId && document.querySelector(`main img[data-pet-photo="${CSS.escape(photoId)}"]`);
 const source = !reducedMotion() && photo();
 const usable = source?.complete && source.naturalWidth > 0 && source.getBoundingClientRect().bottom > 0;
 const before = usable ? source.getBoundingClientRect() : null;
 let destination, after;
 if (before) source.style.viewTransitionName = 'dogmeet-photo';
 const transition = document.startViewTransition(() => {
  update();
  destination = before && photo();
  if (destination?.complete && destination.naturalWidth) {
   after = destination.getBoundingClientRect();
   destination.style.viewTransitionName = 'dogmeet-photo';
   root.style.setProperty('--photo-width', `${after.width}px`);
   root.style.setProperty('--photo-height', `${after.height}px`);
   root.style.setProperty('--photo-x', `${after.x}px`);
   root.style.setProperty('--photo-y', `${after.y}px`);
  }
 });
 activeTransition = transition;
 try {
  await transition.ready;
  if (before && after && after.width && after.height && activeTransition === transition) {
   // Keep snapshot dimensions fixed; animate geometry with transform, not width/height.
   root.animate([
    {transform: `translate(${before.x}px, ${before.y}px) scale(${before.width / after.width}, ${before.height / after.height})`},
    {transform: `translate(${after.x}px, ${after.y}px) scale(1)`}
   ], {pseudoElement: '::view-transition-group(dogmeet-photo)', duration: 240, easing: token('--ease-in-out'), fill: 'both'});
  }
 } catch {
  // Snapshot failure must not prevent the DOM update or navigation.
  transition.skipTransition();
 }
 await transition.finished.catch(() => {});
 source && (source.style.viewTransitionName = '');
 if (activeTransition === transition) {
  if (destination) destination.style.viewTransitionName = '';
  activeTransition = null;
  delete root.dataset.viewTransition;
 }
}
