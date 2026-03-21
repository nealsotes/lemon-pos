import { UserRole } from '../../models/user.model';

export interface NavItem {
  icon: string;   // SVG path(s)
  label: string;
  route: string;
  roles?: UserRole[];  // if undefined, all roles can see
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    icon: '<path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zm-11 11h7v7H3v-7zm11 0h7v7h-7v-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>',
    label: 'POS',
    route: '/pos'
  },
  {
    icon: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zm0 0h12M9 10a3 3 0 006 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    label: 'Cart',
    route: '/cart'
  },
  {
    icon: '<path d="M3 3v18h18M7 16l4-5 4 4 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    label: 'Reports',
    route: '/reports',
    roles: [UserRole.Owner, UserRole.Admin]
  },
  {
    icon: '<path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    label: 'Products',
    route: '/products',
    roles: [UserRole.Owner, UserRole.Admin]
  },
  {
    icon: '<path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4M20 12v4H6a2 2 0 00-2 2c0 1.1.9 2 2 2h12v-4M20 12H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    label: 'Inventory',
    route: '/inventory',
    roles: [UserRole.Owner, UserRole.Admin]
  },
  {
    icon: '<path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/>',
    label: 'Settings',
    route: '/settings',
    adminOnly: true
  }
];
