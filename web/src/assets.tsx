import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

export type AssetMap = Record<string, string>;

type AssetCtx = {
  assets: AssetMap;
  reload: () => Promise<void>;
  setLocal: (key: string, url: string) => void;
};

const AssetContext = createContext<AssetCtx>({
  assets: {},
  reload: async () => undefined,
  setLocal: () => undefined,
});

/**
 * 站点素材：后台按固定 key 上传的图片，前端按 key 取用。
 * 取不到就返回空串，由组件走像素风占位，不会出现破图。
 */
export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<AssetMap>({});

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ assets: AssetMap }>('/assets');
      setAssets(res.assets || {});
    } catch {
      /* 素材加载失败不阻塞页面 */
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setLocal = useCallback((key: string, url: string) => {
    setAssets((prev) => ({ ...prev, [key]: url }));
  }, []);

  const value = useMemo(() => ({ assets, reload, setLocal }), [assets, reload, setLocal]);
  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAsset(key: string) {
  return useContext(AssetContext).assets[key] || '';
}

export function useAssetCtx() {
  return useContext(AssetContext);
}
