// Motion copied from the Dogmeet reference; application navigation owns the state.
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

function durationMs(name, fallback) {
 const value = token(name);
 const duration = Number.parseFloat(value);
 return Number.isFinite(duration) ? duration * (value.endsWith('s') && !value.endsWith('ms') ? 1000 : 1) : fallback;
}

export function animateHeaderEntry(shiftBrand) {
 const header = document.querySelector('.page-header');
 const back = header?.querySelector('.header-back');
 if (!back?.animate) return;
 const reduced = reducedMotion();
 const options = {duration: reduced ? 100 : durationMs('--motion-screen', 180), easing: token('--ease-out'), fill: 'both'};
 back.animate(reduced ? [{opacity: 0}, {opacity: 1}] : [
  {opacity: 0, transform: 'translateX(-100%)'},
  {opacity: 1, transform: 'translateX(0)'}
 ], options);
 const brand = header.querySelector('.brand');
 if (!reduced && shiftBrand && brand?.animate) {
  brand.animate([
   {transform: `translateX(-${back.getBoundingClientRect().width}px)`},
   {transform: 'translateX(0)'}
  ], {...options, duration: durationMs('--motion-shared', 240)});
 }
}

function prepareHeaderExit() {
 const header = document.querySelector('.page-header');
 const back = header?.querySelector('.header-back');
 if (!back?.animate || !document.body) return null;
 const bounds = back.getBoundingClientRect();
 const clone = back.cloneNode(true);
 clone.classList.add('motion-header-back-exit');
 clone.setAttribute('aria-hidden', 'true');
 clone.removeAttribute('aria-label');
 Object.assign(clone.style, {
  position: 'fixed',
  left: `${bounds.left}px`,
  top: `${bounds.top}px`,
  width: `${bounds.width}px`,
  height: `${bounds.height}px`,
  margin: '0',
  pointerEvents: 'none',
  zIndex: '2147483647'
 });
 document.body.appendChild(clone);
 const width = bounds.width;
 const reduced = reducedMotion();
 const options = {duration: reduced ? 100 : durationMs('--motion-screen', 180), easing: token('--ease-out'), fill: 'both'};
 const cleanup = () => clone.isConnected && clone.remove();
 return nextHasBack => {
  if (nextHasBack) { cleanup(); return; }
  const animation = clone.animate(reduced ? [{opacity: 1}, {opacity: 0}] : [
   {opacity: 1, transform: 'translateX(0)'},
   {opacity: 0, transform: 'translateX(-100%)'}
  ], options);
  animation.finished.then(cleanup, cleanup);
  const brand = document.querySelector('.page-header .brand');
  if (!reduced && brand?.animate) {
   brand.animate([
    {transform: `translateX(${width}px)`},
    {transform: 'translateX(0)'}
   ], {...options, duration: durationMs('--motion-shared', 240)});
  }
 };
}

export function animateHeaderExit() {
 const headerExit = prepareHeaderExit();
 if (!headerExit) return;
 requestAnimationFrame(() => headerExit(false));
}

let activeTransition;
let activeDockTransition;

export function dockMotionDuration(dock, hiding) {
 const action = dock.querySelector('.dock-add')?.getAnimations()
  .find(animation => animation.effect?.getKeyframes().some(frame => 'opacity' in frame));
 const remaining = action ? Number(action.effect.getComputedTiming().endTime) - Number(action.currentTime ?? 0) : 0;
 if (remaining > 0) return remaining;
 const value = getComputedStyle(dock).getPropertyValue(hiding ? '--dock-exit' : '--dock-enter').trim();
 return parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
}

function dockParts(screen) {
 return {
  title: screen?.querySelector('.day-heading h1, :scope > h1'),
  date: screen?.querySelector('.date-stamp'),
  panel: screen?.querySelector('[data-dock-panel]'),
 };
}

function partStyle(element) {
 const style = getComputedStyle(element);
 return {opacity: style.opacity, transform: style.transform, filter: style.filter};
}

// Reference screen choreography follows the existing + button's duration and clock.
function transitionDockPage(update, from, target, keyboard) {
 const dock = document.querySelector('.bottom-nav');
 const screen = document.querySelector('main .screen');
 if (!dock || !screen || from === target || keyboard || reducedMotion()
     || !matchMedia('(max-width: 899px)').matches
     || dock.querySelector('.nav-tabs')?.dataset.active !== from) {
  skipPageTransition();
  update();
  return;
 }
 const previousParts = dockParts(screen);
 const stylesFor = parts => Object.fromEntries(Object.entries(parts)
  .filter(([, element]) => element).map(([key, element]) => [key, partStyle(element)]));
 const previousStyles = stylesFor(previousParts);
 const resume = activeDockTransition?.from === target
  ? stylesFor(dockParts(activeDockTransition.clone)) : {};
 const emptySelector = '.state-block:not([role]):not([aria-busy=true])';
 const empty = previousParts.panel?.querySelector(emptySelector);
 const emptyBounds = empty?.getBoundingClientRect();
 const bounds = screen.getBoundingClientRect();
 const clone = screen.cloneNode(true);
 // Avoid making the new page inherit Nearby's min-height through :has().
 clone.classList.remove('walks-screen');
 clone.classList.add('dock-screen-exit');
 clone.setAttribute('aria-hidden', 'true');
 clone.inert = true;
 clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
 clone.querySelectorAll('img').forEach(image => image.alt = '');
 const header = clone.querySelector('.page-header');
 if (header) header.style.visibility = 'hidden';
 Object.assign(clone.style, {
  position: 'fixed', left: `${bounds.left}px`, top: `${bounds.top}px`,
  width: `${bounds.width}px`, height: `${bounds.height}px`,
  pointerEvents: 'none', zIndex: '2',
 });
 skipPageTransition();
 document.querySelector('.phone').appendChild(clone);
 const outgoing = dockParts(clone);
 for (const [key, element] of Object.entries(outgoing)) {
  if (element) Object.assign(element.style, previousStyles[key]);
 }
 const dockStyle = getComputedStyle(dock);
 const spring = dockStyle.getPropertyValue('--dock-show-ease').trim();
 const ease = 'cubic-bezier(.20,.82,.18,1)';
 // Tracks created in this commit share WAAPI's next render start. Backdating
 // startTime to the previous frame skips motion while React updates the route.
 try { update(); } catch (error) {
  clone.remove();
  throw error;
 }
 const duration = dockMotionDuration(dock, target === 'nearby');
 const scale = duration / 640;
 const incoming = dockParts(document.querySelector('main .screen'));
 const animations = [];
 const animate = (element, initial, final, timings, delay = 0) => {
  if (!element) return;
  for (const [property, ms] of Object.entries(timings)) {
   const animation = element.animate([{[property]: initial[property]}, {[property]: final[property]}], {
    duration: ms * scale, delay: delay * scale, fill: 'both',
    easing: property === 'transform' ? (element.hasAttribute('data-dock-panel') ? spring : ease) : 'ease',
   });
   animations.push(animation);
  }
 };
 const shown = {opacity: 1, transform: 'none', filter: 'blur(0px)'};
 const hidden = transform => ({opacity: 0, transform, filter: 'blur(2px)'});
 const betweenCollections = from !== 'nearby' && target !== 'nearby';
 const titleTimings = page => ({opacity: page === 'nearby' ? 220 : 250, transform: page === 'nearby' ? 420 : betweenCollections || page === 'pets' ? 520 : 500, filter: page === 'nearby' ? 300 : 320});
 const panelTimings = page => ({opacity: 260, transform: betweenCollections || page === 'pets' ? 540 : 640, filter: 320});
 const returning = target === 'nearby';
 const sharedEmpty = empty && target !== 'pets' && from !== 'pets'
  && incoming.panel?.querySelector(emptySelector);
 animate(outgoing.title, previousStyles.title, returning && from === 'plans'
  ? {opacity: 0, transform: 'translateY(16px) scale(.98)', filter: 'blur(1.5px)'}
  : hidden(from === 'nearby' ? 'translateX(-26px) scale(.965)' : returning || from === 'pets' ? 'translateX(30px) scale(.98)' : 'translateX(-30px) scale(.98)'),
  returning && from === 'plans' ? {opacity: 210, transform: 210, filter: 210} : titleTimings(from));
 animate(outgoing.date, previousStyles.date, hidden('translateX(28px) scale(.94)'), {opacity: 220, transform: 460, filter: 300});
 if (sharedEmpty) {
  outgoing.panel.remove();
  const nextBounds = sharedEmpty.getBoundingClientRect();
  animate(incoming.panel, {transform: `translate(${emptyBounds.left - nextBounds.left}px, ${emptyBounds.top - nextBounds.top}px)`},
   {transform: 'none'}, {transform: 640});
 } else {
  animate(outgoing.panel, previousStyles.panel, hidden(returning || from === 'pets' ? 'translateX(30px)' : 'translateX(-30px)'), panelTimings(from));
  animate(incoming.panel, resume.panel ?? hidden(target === 'pets' ? 'translateX(34px)' : betweenCollections ? 'translateX(-34px)' : target === 'plans' ? 'translateY(24px)' : 'translateX(-30px)'),
   shown, panelTimings(target), betweenCollections || target === 'pets' ? 95 : 0);
 }
 animate(incoming.title, resume.title ?? hidden(target === 'nearby' ? 'translateX(-26px) scale(.965)'
  : target === 'pets' ? 'translateX(30px) scale(.98)' : from === 'pets' ? 'translateX(-30px) scale(.98)' : 'translateY(24px) scale(.975)'),
  shown, titleTimings(target), returning ? 110 : betweenCollections || target === 'pets' ? 70 : 95);
 animate(incoming.date, resume.date ?? hidden('translateX(28px) scale(.94)'), shown, {opacity: 220, transform: 460, filter: 300}, returning ? 110 : 0);
 const cleanup = () => {
  animations.forEach(animation => animation.cancel());
  clone.remove();
  if (activeDockTransition?.clone === clone) activeDockTransition = undefined;
 };
 activeDockTransition = {from, clone, cleanup};
 void Promise.all(animations.map(animation => animation.finished)).then(cleanup, () => {});
}
export function skipPageTransition() {
 activeTransition?.skipTransition();
 activeDockTransition?.cleanup();
}

export async function transitionPage(update, {direction, photoId, keyboard, from, target}) {
 const root = document.documentElement;
 root.dataset.motionDirection = direction < 0 ? 'back' : 'forward';
 if (target === 'nearby' || target === 'plans' || target === 'pets') {
  transitionDockPage(update, from, target, keyboard);
  return;
 }
 skipPageTransition();
 const previousHasBack = Boolean(document.querySelector('.page-header .header-back'));
 const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
 const canViewTransition = !isAndroid
  && typeof document.startViewTransition === 'function'
  && typeof CSS !== 'undefined' && CSS.supports('view-transition-name', 'dogmeet-header');
 const headerExit = !canViewTransition && !keyboard && previousHasBack ? prepareHeaderExit() : null;
 if (keyboard) {
  update();
  headerExit?.(Boolean(document.querySelector('.page-header .header-back')));
  return;
 }
 if (!canViewTransition) {
  update();
  if (headerExit) headerExit(Boolean(document.querySelector('.page-header .header-back')));
  else animateHeaderEntry(!previousHasBack);
  return;
 }
 if (reducedMotion()) { update(); fadeIn(document.querySelector('main')); return; }
 root.dataset.viewTransition = 'active';
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
 if (source) source.style.viewTransitionName = '';
 if (activeTransition === transition) {
  if (destination) destination.style.viewTransitionName = '';
  activeTransition = null;
  delete root.dataset.viewTransition;
 }
}
