import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { router } from './router.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // I4: данные считаем свежими 30 с — без лишних фоновых перезапросов;
      // мутации инвалидируют ключи явно.
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
