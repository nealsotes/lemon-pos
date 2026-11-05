import { of } from 'rxjs';

import { NAV_ITEMS } from './nav-items';
import { BottomTabBarComponent } from '../bottom-tab-bar/bottom-tab-bar.component';
import { UserRole } from '../../models/user.model';

describe('navigation printer item', () => {
  it('exposes the printer item after Expenses and before Users, owner/admin only', () => {
    const printer = NAV_ITEMS.find(item => item.route === '/printer-settings');
    expect(printer).toBeDefined();
    expect(printer!.label).toBe('Printer');
    expect(printer!.roles).toEqual([UserRole.Owner, UserRole.Admin]);
    const labels = NAV_ITEMS.map(item => item.label);
    expect(labels.indexOf('Printer')).toBeGreaterThan(labels.indexOf('Expenses'));
    expect(labels.indexOf('Printer')).toBeLessThan(labels.indexOf('Users'));
    // Existing items keep their order.
    expect(labels.slice(0, labels.indexOf('Printer'))).toEqual(['POS', 'Cart', 'Reports', 'Products', 'Inventory', 'Expenses']);
  });

  it('keeps employees out of the printer item', () => {
    const printer = NAV_ITEMS.find(item => item.route === '/printer-settings');
    expect(printer!.roles).not.toContain(UserRole.Employee);
  });

  it('always renders the four existing primary tabs unchanged', () => {
    const tabs = buildTabBar('owner').visibleTabs.map(tab => tab.label);
    expect(tabs).toEqual(['POS', 'Cart', 'Reports', 'Products']);
  });

  it('shows the printer item in the mobile More menu for owners and admins, not employees', () => {
    const owner = buildTabBar('owner');
    expect(owner.filteredMoreItems.map(item => item.route)).toContain('/printer-settings');
    // Settings is adminOnly, so an owner sees Inventory, Printer, Users.
    expect(owner.filteredMoreItems.map(item => item.label).join('|')).toBe('Inventory|Printer|Users');

    const employee = buildTabBar('employee');
    expect(employee.filteredMoreItems.map(item => item.route)).not.toContain('/printer-settings');

    const admin = buildTabBar('admin');
    expect(admin.filteredMoreItems.map(item => item.route)).toContain('/printer-settings');
    expect(admin.filteredMoreItems.map(item => item.label).join('|')).toBe('Inventory|Printer|Users|Settings');
  });
});

function buildTabBar(role: 'owner' | 'employee' | 'admin'): BottomTabBarComponent {
  const auth = {
    currentUser$: of({ username: role, role: role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'employee' }),
    isOwner: () => role === 'owner',
    isAdmin: () => role === 'admin'
  };
  const settings = {
    pageSettings$: of([{
      path: '/printer-settings', name: 'Printer Settings', enabled: true, requiresOwner: true
    }])
  };
  const component = new BottomTabBarComponent(auth as any, settings as any, { bypassSecurityTrustHtml: (x: string) => x } as any);
  component.ngOnInit();
  return component;
}
