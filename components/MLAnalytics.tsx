import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ComposedChart,
} from 'recharts';

interface AnalyticsData {
  month: string;
  efficiency: number;
  costEffective: number;
  testPilotData: number;
  timeSaving: number;
  predictions: number;
  anomalies: number;
}

const MLAnalytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      try {
        setLoading(true);
        // Generate sample data - in production, fetch from your ML API
        const analyticsData: AnalyticsData[] = [
          {
            month: 'Jan',
            efficiency: 65,
            costEffective: 45,
            testPilotData: 38,
            timeSaving: 28,
            predictions: 72,
            anomalies: 8,
          },
          {
            month: 'Feb',
            efficiency: 72,
            costEffective: 52,
            testPilotData: 45,
            timeSaving: 35,
            predictions: 78,
            anomalies: 6,
          },
          {
            month: 'Mar',
            efficiency: 78,
            costEffective: 58,
            testPilotData: 52,
            timeSaving: 42,
            predictions: 82,
            anomalies: 5,
          },
          {
            month: 'Apr',
            efficiency: 85,
            costEffective: 65,
            testPilotData: 62,
            timeSaving: 55,
            predictions: 88,
            anomalies: 3,
          },
          {
            month: 'May',
            efficiency: 88,
            costEffective: 72,
            testPilotData: 70,
            timeSaving: 63,
            predictions: 91,
            anomalies: 2,
          },
          {
            month: 'Jun',
            efficiency: 92,
            costEffective: 78,
            testPilotData: 78,
            timeSaving: 71,
            predictions: 94,
            anomalies: 1,
          },
        ];
        setData(analyticsData);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
        setLoading(false);
      }
    };

    fetchAnalyticsData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-white text-xl">Loading ML Analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-red-400 text-xl">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">ML Analytics Dashboard</h1>
          <p className="text-gray-300">Real-time performance metrics and insights</p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg p-6 text-white">
            <p className="text-gray-200 text-sm mb-1">Current Efficiency</p>
            <p className="text-3xl font-bold">{data[data.length - 1]?.efficiency}%</p>
            <p className="text-green-300 text-xs mt-2">↑ 27% from baseline</p>
          </div>
          <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-lg p-6 text-white">
            <p className="text-gray-200 text-sm mb-1">Cost Effective</p>
            <p className="text-3xl font-bold">{data[data.length - 1]?.costEffective}%</p>
            <p className="text-green-300 text-xs mt-2">↑ 33% savings</p>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg p-6 text-white">
            <p className="text-gray-200 text-sm mb-1">Test Pilot Data</p>
            <p className="text-3xl font-bold">{data[data.length - 1]?.testPilotData}%</p>
            <p className="text-green-300 text-xs mt-2">↑ 40% improvement</p>
          </div>
          <div className="bg-gradient-to-br from-orange-600 to-orange-800 rounded-lg p-6 text-white">
            <p className="text-gray-200 text-sm mb-1">Time Saving</p>
            <p className="text-3xl font-bold">{data[data.length - 1]?.timeSaving}%</p>
            <p className="text-green-300 text-xs mt-2">↑ 43% reduction</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Efficiency Chart */}
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Efficiency Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="month" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Line
                  type="monotone"
                  dataKey="efficiency"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Cost Effectiveness Chart */}
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Cost Effectiveness vs Time Saving</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="month" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend />
                <Bar dataKey="costEffective" fill="#10b981" name="Cost Effective %" />
                <Line 
                  type="monotone" 
                  dataKey="timeSaving" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  name="Time Saving %"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Test Pilot Data Chart */}
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Test Pilot Data Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorTestPilot" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="month" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Area
                  type="monotone"
                  dataKey="testPilotData"
                  stroke="#a855f7"
                  fillOpacity={1}
                  fill="url(#colorTestPilot)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* All Metrics Comparison */}
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">All Metrics Comparison</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="month" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend />
                <Line type="monotone" dataKey="efficiency" stroke="#3b82f6" strokeWidth={2} name="Efficiency" />
                <Line type="monotone" dataKey="costEffective" stroke="#10b981" strokeWidth={2} name="Cost Effective" />
                <Line type="monotone" dataKey="testPilotData" stroke="#a855f7" strokeWidth={2} name="Test Pilot Data" />
                <Line type="monotone" dataKey="timeSaving" stroke="#f59e0b" strokeWidth={2} name="Time Saving" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ML Model Performance */}
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">ML Model Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="month" stroke="#cbd5e1" />
                <YAxis stroke="#cbd5e1" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend />
                <Bar dataKey="predictions" fill="#6366f1" name="Predictions Accuracy %" />
                <Bar dataKey="anomalies" fill="#ef4444" name="Anomalies Detected" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Efficiency vs Cost Analysis */}
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Efficiency vs Cost Analysis</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis 
                  dataKey="efficiency" 
                  name="Efficiency %" 
                  stroke="#cbd5e1"
                />
                <YAxis 
                  dataKey="costEffective" 
                  name="Cost Effective %" 
                  stroke="#cbd5e1"
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelStyle={{ color: '#e2e8f0' }}
                  cursor={{ strokeDasharray: '3 3' }}
                />
                <Scatter
                  name="Performance"
                  data={data}
                  fill="#06b6d4"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="bg-slate-800 rounded-lg p-6 shadow-xl border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Summary Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-gray-300">
            <div>
              <p className="text-sm text-gray-400 mb-1">Average Efficiency</p>
              <p className="text-2xl font-bold text-blue-400">
                {Math.round(data.reduce((sum, d) => sum + d.efficiency, 0) / data.length)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Average Cost Savings</p>
              <p className="text-2xl font-bold text-green-400">
                {Math.round(data.reduce((sum, d) => sum + d.costEffective, 0) / data.length)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Average Time Saved</p>
              <p className="text-2xl font-bold text-orange-400">
                {Math.round(data.reduce((sum, d) => sum + d.timeSaving, 0) / data.length)}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MLAnalytics;
