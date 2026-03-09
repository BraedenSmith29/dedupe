export type NavigationMethod =
    | 'reload'
    | 'deliberateDuplicateOrHistory'
    | 'firstNavigationInFreshTab'
    | 'openedInNewWindow'
    | 'openedInNewTabInSameWindow'
    | 'redirect';

export interface NavigationData {
    tabId: number;
    newTab: boolean;
    newWindow: boolean;
    sourceWindowId: number;
    targetWindowId: number;
}