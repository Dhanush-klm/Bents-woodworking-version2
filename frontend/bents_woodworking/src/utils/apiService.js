import axios from 'axios';
import { useAuth } from '@clerk/clerk-react';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5002',
});

export const AxiosInterceptor = ({ children }) => {
  const { getToken } = useAuth();

  api.interceptors.request.use(async (config) => {
    try {
      const token = await getToken();
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting token:', error);
    }
    return config;
  }, (error) => {
    return Promise.reject(error);
  });

  return children;
};

export const useApi = () => {
  return api;
};