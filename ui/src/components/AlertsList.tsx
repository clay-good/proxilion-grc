import { AlertTriangle, Info, AlertCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';

interface Alert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  title: string;
  message: string;
  acknowledged: boolean;
}

interface AlertsListProps {
  alerts: Alert[];
  loading: boolean;
}

const severityConfig = {
  info: {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  error: {
    icon: AlertCircle,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  critical: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

export function AlertsList({ alerts, loading }: AlertsListProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center justify-between">
        <span className="flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
          Recent Alerts
        </span>
        <span className="text-sm font-normal text-gray-500">
          {alerts.length} unacknowledged
        </span>
      </h2>

      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <Info className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No active alerts</p>
          <p className="text-sm text-gray-400 mt-1">All systems operating normally</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {alerts.slice(0, 10).map((alert) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;

            return (
              <div
                key={alert.id}
                className={clsx(
                  'p-4 rounded-lg border',
                  config.bg,
                  config.border
                )}
              >
                <div className="flex items-start space-x-3">
                  <Icon className={clsx('h-5 w-5 flex-shrink-0 mt-0.5', config.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={clsx('text-sm font-semibold', config.color)}>
                        {alert.title}
                      </p>
                      <span className="text-xs text-gray-500">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-gray-200 text-gray-700">
                        {alert.category}
                      </span>
                      <span className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase',
                        config.color,
                        'bg-white border',
                        config.border
                      )}>
                        {alert.severity}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

