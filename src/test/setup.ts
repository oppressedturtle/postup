import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock next/navigation globally
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock next/headers globally
vi.mock('next/headers', () => ({
  cookies: () => ({ get: vi.fn(), set: vi.fn() }),
  headers: () => new Headers(),
}))

// Mock next-auth/react globally (component tests override per-test as needed)
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: {
      user: { id: 'user-1', handle: 'testuser', email: 'test@example.com', role: 'MEMBER', clout: 0 },
      expires: '',
    },
    status: 'authenticated',
    update: vi.fn(),
  })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))
