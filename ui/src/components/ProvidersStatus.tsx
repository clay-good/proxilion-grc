import { Server, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface Provider {
  requests: number;
  errors: number;
  avgLatency: number;
  availability: number;
}

interface ProvidersStatusProps {
  providers: Record<string, Provider>;
}

export function ProvidersStatus({ providers }: ProvidersStatusProps) {
  const providersList = Object.entries(providers);

  const getStatusIcon = (availability: number) => {
    if (availability >= 0.99) return { icon: CheckCircle, color: 'text-green-600' };
    if (availability >= 0.95) return { icon: AlertCircle, color: 'text-yellow-600' };
    return { icon: XCircle, color: 'text-red-600' };
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Server className="h-5 w-5 mr-2 text-primary-600" />
        Provider Status
      </h2>

      {providersList.length === 0 ? (
        <div className="text-center py-8">
          <Server className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No provider data available</p>
        </div>
      ) : (
        <div className="space-y-4">
          {providersList.map(([name, provider]) => {
            const { icon: StatusIcon, color } = getStatusIcon(provider.availability);
            const errorRate = provider.requests > 0 
              ? (provider.errors / provider.requests) * 100 
              : 0;

            return (
              <div key={name} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <StatusIcon className={clsx('h-5 w-5', color)} />
                    <h3 className="font-semibold text-gray-900 capitalize">{name}</h3>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {(provider.availability * 100).toFixed(2)}% uptime
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Requests</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {provider.requests.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Avg Latency</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {provider.avgLatency.toFixed(0)}ms
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Error Rate</p>
                    <p className={clsx(
                      'text-lg font-semibold',
                      errorRate > 5 ? 'text-red-600' : 'text-gray-900'
                    )}>
                      {errorRate.toFixed(2)}%
                    </p>
                  </div>
                </div>

                {/* Availability bar */}
                <div className="mt-3">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full transition-all duration-300',
                        provider.availability >= 0.99 ? 'bg-green-500' :
                        provider.availability >= 0.95 ? 'bg-yellow-500' :
                        'bg-red-500'
                      )}
                      style={{ width: `${provider.availability * 100}%` }}
                    />
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

