import { createContext, useContext } from "react";

/**
 * Panel navigation, one level deep.
 *
 * The patient panel is state-driven: a nav tile sets `currentSection`, and
 * `PatientPanel` renders the matching section. That works until a section needs
 * to *send* the user somewhere — an empty state whose only sensible action is
 * "book an appointment" — at which point a section either reaches into the DOM
 * for the nav button (fragile: hidden, duplicated, or reordered markup breaks it
 * silently) or the panel has to pass a callback to every child.
 *
 * This is the third option: the panel publishes one function, and any section
 * that needs to navigate reads it. It is deliberately tiny — there is no history,
 * no routing and no state beyond "go to this section" — because the product has
 * one flat level of navigation and inventing a router for it would be the wrong
 * trade.
 *
 * `null` when no provider is present, so a section rendered in isolation (a test,
 * a story) degrades to not rendering the CTA rather than crashing or rendering a
 * button that does nothing.
 */
export type SectionNavigator = (section: string) => void;

export const SectionNavContext = createContext<SectionNavigator | null>(null);

export function useSectionNav(): SectionNavigator | null {
  return useContext(SectionNavContext);
}
