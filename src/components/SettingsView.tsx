import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { MetadataAutoSyncSetting } from '../types';
import { ConfirmDialog } from './Modal';

export default function SettingsView({
  onToast,
}: {
  onToast: (message: string, error?: boolean) => void;
}) {
  const [setting, setSetting] = useState<MetadataAutoSyncSetting | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmEnable, setConfirmEnable] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api.settings();
      setSetting(result.metadata_auto_sync);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await api.setMetadataAutoSync(enabled);
      setSetting(result.metadata_auto_sync);
      onToast(
        enabled
          ? '已开启列表元数据自动同步'
          : '已关闭列表元数据自动同步，待执行同步已取消'
      );
    } catch (e) {
      onToast(`更新设置失败：${(e as Error).message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = () => {
    if (!setting || setting.locked || saving) return;
    if (setting.enabled) {
      void save(false);
      return;
    }
    setConfirmEnable(true);
  };

  const handleConfirmEnable = () => {
    if (saving) return;
    setConfirmEnable(false);
    void save(true);
  };

  return (
    <section className="settings-page">
      <div className="page-head">
        <h1 className="page-title">设置</h1>
        <p className="page-desc">这些设置仅保存在本地 SQLite 数据库中，不会同步到 data/skills.json。</p>
      </div>

      {!setting && !error && (
        <div className="settings-card settings-loading" aria-live="polite">加载设置中…</div>
      )}

      {!setting && error && (
        <div className="settings-card settings-error" role="alert">
          <div>加载设置失败：{error}</div>
          <button className="btn ghost" type="button" onClick={() => void load()}>重试</button>
        </div>
      )}

      {setting && (
        <article className="settings-card">
          <div className="settings-row">
            <div className="settings-copy">
              <div className="settings-title">
                <h2>列表元数据自动同步</h2>
                <span className={`badge${setting.enabled ? ' ok' : ''}`}>
                  {setting.enabled ? '已开启' : '已关闭'}
                </span>
              </div>
              <p>
                开启后，列表管理操作会在约 2.5 秒后自动导出、提交并推送
                <code>data/skills.json</code>。
              </p>
              <p className="settings-scope">
                范围说明：它绝不会扫描、提交或推送已 clone 的 skill 源码仓库；手动执行
                <code>npm run export</code>不受影响。
              </p>
              {setting.locked && (
                <p className="settings-locked">
                  由 AUTO_SYNC 环境变量强制开启/关闭。修改环境变量并重启服务后才能在此切换。
                </p>
              )}
            </div>

            <div className="settings-control">
              {saving && <span className="settings-saving" aria-live="polite">保存中…</span>}
              <button
                className="settings-switch"
                type="button"
                role="switch"
                aria-label="列表元数据自动同步"
                aria-checked={setting.enabled}
                disabled={setting.locked || saving}
                onClick={handleToggle}
              >
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
              </button>
            </div>
          </div>
        </article>
      )}

      {confirmEnable && (
        <ConfirmDialog
          title="开启自动同步？"
          confirmText="确认开启"
          danger={false}
          message="开启后，今后的列表管理操作会写入当前项目配置的 Git remote：约 2.5 秒后导出、提交并推送 data/skills.json；不包含任何已 clone 的 skill 源码仓库。"
          onConfirm={handleConfirmEnable}
          onCancel={() => setConfirmEnable(false)}
        />
      )}
    </section>
  );
}
