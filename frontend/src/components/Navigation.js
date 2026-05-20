import React from 'react';
import UnifiedTopbar from '@/components/UnifiedTopbar';

/**
 * Navigation — legacy wrapper. Renders UnifiedTopbar so every page using
 * <Navigation/> automatically gets the new unified topbar with role-aware menus.
 *
 * The original Navigation component had a separate logo/menu/avatar layout that
 * diverged visually from the home page Topbar. Routing all pages through
 * UnifiedTopbar ensures consistent look + behaviour across the whole app.
 *
 * Accepts an optional `active` prop so callers can highlight the current section
 * (e.g. <Navigation active="dashboard" />).
 */
const Navigation = ({ active = '' }) => (
  <UnifiedTopbar active={active} />
);

export default Navigation;
