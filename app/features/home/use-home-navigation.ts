"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { directionFor, skipPageTransition, transitionPage } from "../../components/ui/motion.mjs";

export type Screen = "walk-detail" | "contact" | "welcome" | "browser-guide" | "location" | "location-request" | "walks" | "pet" | "announce" | "my-walks" | "my-pets";
export type PrimaryDockSection = "nearby" | "profile";
export type DockSection = PrimaryDockSection | "walk" | "pets";
export type DockPanelSection = "nearby" | "walk" | "profile";

export type AppNavigationState = {
  dogmeetNavigation: true;
  screen: Screen;
  menuOpen: boolean;
  locationOpenedFromMenu: boolean;
  dockWalkOpen: boolean;
  dockReturnSection: PrimaryDockSection;
  petsSource: "dock" | "profile" | null;
};

type NavigationOptions = Partial<Pick<AppNavigationState, "menuOpen" | "locationOpenedFromMenu" | "dockWalkOpen" | "dockReturnSection" | "petsSource">>;

export function createNavigationState(screen: Screen, options: NavigationOptions = {}): AppNavigationState {
  return {
    dogmeetNavigation: true,
    screen,
    menuOpen: options.menuOpen ?? false,
    locationOpenedFromMenu: options.locationOpenedFromMenu ?? false,
    dockWalkOpen: options.dockWalkOpen ?? false,
    dockReturnSection: options.dockReturnSection ?? "nearby",
    petsSource: options.petsSource ?? null
  };
}

function normalizeNavigationState(value: Partial<AppNavigationState>): AppNavigationState | null {
  if (!value.dogmeetNavigation || !value.screen) return null;
  return createNavigationState(value.screen, {
    menuOpen: Boolean(value.menuOpen),
    locationOpenedFromMenu: Boolean(value.locationOpenedFromMenu),
    dockWalkOpen: Boolean(value.dockWalkOpen),
    dockReturnSection: value.dockReturnSection ?? "nearby",
    petsSource: value.petsSource === "dock" || value.petsSource === "profile" ? value.petsSource : null
  });
}

function dockSectionFor(navigation: AppNavigationState | null): DockSection {
  if (!navigation) return "nearby";
  if (navigation.petsSource === "dock") return "pets";
  if (navigation.dockWalkOpen) return "walk";
  if (navigation.menuOpen) return "profile";
  return navigation.dockReturnSection;
}

export function useHomeNavigation(hasLocation: boolean) {
  const [navigation, setNavigation] = useState<AppNavigationState | null>(null);
  const previousNavigation = useRef<AppNavigationState | null>(null);
  const dockSection = dockSectionFor(navigation);

  const applyNavigationState = useCallback((nextNavigation: AppNavigationState, back = false) => {
    const previous = previousNavigation.current;
    previousNavigation.current = nextNavigation;
    if (!previous) { setNavigation(nextNavigation); return; }
    const page = (value: AppNavigationState) => value.screen === "my-pets" ? "pets" : value.screen === "my-walks" ? "plans" : value.menuOpen ? "profile" : value.dockWalkOpen ? "announce" : value.screen === "walks" ? "nearby" : value.screen;
    const from = page(previous), to = page(nextNavigation);
    const photo = (from === "pets" && to === "pet") || (from === "pet" && to === "pets")
      ? document.activeElement?.closest(".pet-row")?.querySelector<HTMLElement>("[data-pet-photo]")?.dataset.petPhoto ?? document.querySelector<HTMLElement>("main .portrait")?.dataset.petPhoto
      : undefined;
    void transitionPage(() => {
      if (previousNavigation.current !== nextNavigation) return;
      flushSync(() => setNavigation(nextNavigation));
      window.scrollTo(0, 0);
      const heading = document.querySelector<HTMLElement>("main h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    }, { direction: directionFor(from, to, back), photoId: photo, keyboard: document.documentElement.dataset.motionInput === "keyboard" });
  }, []);

  const buildNavigationState = useCallback((nextScreen: Screen, options: NavigationOptions = {}) => {
    const currentDockSection: PrimaryDockSection = dockSection === "nearby" || dockSection === "profile"
      ? dockSection
      : navigation?.dockReturnSection ?? "nearby";
    return createNavigationState(nextScreen, {
      ...options,
      dockReturnSection: options.dockReturnSection ?? currentDockSection
    });
  }, [dockSection, navigation]);

  const pushNavigation = useCallback((nextScreen: Screen, options: NavigationOptions = {}) => {
    const nextNavigation = buildNavigationState(nextScreen, options);
    window.history.pushState(nextNavigation, "", window.location.href);
    applyNavigationState(nextNavigation);
  }, [applyNavigationState, buildNavigationState]);

  const replaceNavigation = useCallback((nextScreen: Screen, options: NavigationOptions = {}) => {
    const nextNavigation = buildNavigationState(nextScreen, options);
    window.history.replaceState(nextNavigation, "", window.location.href);
    applyNavigationState(nextNavigation);
  }, [applyNavigationState, buildNavigationState]);

  const returnThroughHistory = useCallback(() => {
    const current = window.history.state as Partial<AppNavigationState> | null;
    if (current?.dogmeetNavigation) {
      window.history.back();
      return;
    }
    replaceNavigation(hasLocation ? "walks" : "welcome");
  }, [hasLocation, replaceNavigation]);

  const initializeNavigation = useCallback((initialNavigation: AppNavigationState, returnNavigation?: AppNavigationState) => {
    if (returnNavigation) {
      window.history.replaceState(returnNavigation, "", window.location.href);
      window.history.pushState(initialNavigation, "", window.location.href);
    } else {
      window.history.replaceState(initialNavigation, "", window.location.href);
    }
    applyNavigationState(initialNavigation);
  }, [applyNavigationState]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const nextNavigation = normalizeNavigationState(event.state as Partial<AppNavigationState>);
      if (nextNavigation) applyNavigationState(nextNavigation, true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyNavigationState]);

  useEffect(() => {
    const pointer = () => { document.documentElement.dataset.motionInput = "pointer"; };
    const keyboard = () => { document.documentElement.dataset.motionInput = "keyboard"; };
    const preference = () => { skipPageTransition(); };
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("pointerdown", pointer);
    window.addEventListener("keydown", keyboard);
    motion.addEventListener("change", preference);
    return () => {
      window.removeEventListener("pointerdown", pointer);
      window.removeEventListener("keydown", keyboard);
      motion.removeEventListener("change", preference);
      skipPageTransition();
    };
  }, []);

  return {
    screen: navigation?.screen ?? null,
    menuOpen: navigation?.menuOpen ?? false,
    locationOpenedFromMenu: navigation?.locationOpenedFromMenu ?? false,
    dockWalkOpen: navigation?.dockWalkOpen ?? false,
    dockReturnSection: navigation?.dockReturnSection ?? "nearby",
    petsSource: navigation?.petsSource ?? null,
    dockSection,
    initializeNavigation,
    pushNavigation,
    replaceNavigation,
    returnThroughHistory
  };
}
