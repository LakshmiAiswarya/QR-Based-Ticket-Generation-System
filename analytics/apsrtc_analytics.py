import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from datetime import datetime
import os
import warnings

warnings.filterwarnings('ignore')

# IEEE-compliant professional style
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['Arial', 'Helvetica']
plt.rcParams['font.size'] = 10
plt.rcParams['axes.labelsize'] = 11
plt.rcParams['axes.titlesize'] = 12
plt.rcParams['xtick.labelsize'] = 9
plt.rcParams['ytick.labelsize'] = 9
plt.rcParams['legend.fontsize'] = 9
plt.rcParams['figure.facecolor'] = 'white'
plt.rcParams['axes.facecolor'] = 'white'
plt.rcParams['text.color'] = 'black'
plt.rcParams['axes.labelcolor'] = 'black'
plt.rcParams['xtick.color'] = 'black'
plt.rcParams['ytick.color'] = 'black'
plt.rcParams['axes.linewidth'] = 0.8
plt.rcParams['xtick.major.width'] = 0.8
plt.rcParams['ytick.major.width'] = 0.8
plt.rcParams['grid.color'] = 'gray'
plt.rcParams['grid.linestyle'] = ':'
plt.rcParams['grid.linewidth'] = 0.5

# IEEE color palette (professional)
ieee_colors = ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30', '#4DBEEE', '#A2142F', '#FF7F0E']

# Load data
csv_path = os.path.join(os.path.dirname(__file__), '..', 'exports', 'ticket_records_training.csv')
df = pd.read_csv(csv_path)

print(f"Loaded {len(df)} ticket records")
print(f"Date range: {df['timestamp_iso'].min()} to {df['timestamp_iso'].max()}")

# Create output directory for graphs
output_dir = os.path.join(os.path.dirname(__file__), '..', 'exports', 'analytics_graphs')
os.makedirs(output_dir, exist_ok=True)

# Convert timestamp to datetime
df['timestamp_iso'] = pd.to_datetime(df['timestamp_iso'], errors='coerce')

# ============================================================================
# Graph 1: EFFICIENCY OVER TIME
# ============================================================================
fig, ax = plt.subplots(figsize=(8, 5))

# Calculate daily efficiency (success rate)
df['date'] = df['timestamp_iso'].dt.date
daily_stats = df.groupby('date').agg({
    'status': lambda x: (x == 'SUCCESS').sum() / len(x) * 100,
    'id': 'count'
}).rename(columns={'status': 'efficiency', 'id': 'transaction_count'})

dates = [str(d) for d in daily_stats.index]
x_pos = np.arange(len(dates))

ax.plot(x_pos, daily_stats['efficiency'].values, marker='o', linewidth=1.5, 
        markersize=6, color=ieee_colors[0], label='System Efficiency')
ax.fill_between(x_pos, daily_stats['efficiency'].values, alpha=0.2, color=ieee_colors[0])
ax.set_xlabel('Date', fontsize=11, fontweight='bold')
ax.set_ylabel('Efficiency (%)', fontsize=11, fontweight='bold')
ax.set_xticks(x_pos)
ax.set_xticklabels(dates, rotation=45, ha='right')
ax.set_ylim([0, 105])
ax.grid(True, alpha=0.3, linestyle=':', linewidth=0.5)
ax.set_axisbelow(True)

# Add figure caption
fig.text(0.5, -0.12, 'Fig. 1. System Efficiency Over Time', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.08, 1, 1])
plt.savefig(os.path.join(output_dir, '1_efficiency_over_time.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 1 - Efficiency Over Time")

# ============================================================================
# Graph 2: COST EFFECTIVENESS
# ============================================================================
fig, ax = plt.subplots(figsize=(8, 5))

# Calculate daily cost metrics
daily_cost = df.groupby('date').agg({
    'savings_amount': 'sum',
    'paid_amount': 'sum',
    'id': 'count'
}).rename(columns={'id': 'transactions'})

daily_cost['total_value'] = daily_cost['savings_amount'] + daily_cost['paid_amount']
daily_cost['cost_effectiveness'] = (daily_cost['savings_amount'] / daily_cost['total_value'] * 100).fillna(0)

dates = [str(d) for d in daily_cost.index]
x_pos = np.arange(len(daily_cost))
bars = ax.bar(x_pos, daily_cost['cost_effectiveness'], color=ieee_colors[1], alpha=0.8, width=0.6)
ax.set_xlabel('Date', fontsize=11, fontweight='bold')
ax.set_ylabel('Cost Effectiveness (%)', fontsize=11, fontweight='bold')
ax.set_xticks(x_pos)
ax.set_xticklabels(dates, rotation=45, ha='right')
ax.set_ylim([0, 105])
ax.grid(True, alpha=0.3, axis='y', linestyle=':', linewidth=0.5)
ax.set_axisbelow(True)

# Add value labels on bars
for i, bar in enumerate(bars):
    height = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2., height,
            f'{height:.1f}%', ha='center', va='bottom', fontsize=8)

fig.text(0.5, -0.12, 'Fig. 2. Cost Effectiveness Analysis', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.08, 1, 1])
plt.savefig(os.path.join(output_dir, '2_cost_effectiveness.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 2 - Cost Effectiveness")

# ============================================================================
# Graph 3: TEST PILOT DATA PERFORMANCE
# ============================================================================
fig, ax = plt.subplots(figsize=(8, 5))

# Filter pilot records
pilot_data = df[df['eligibility_reason'].str.contains('Stree Shakti|PILOT', case=False, na=False)]
daily_pilot = pilot_data.groupby('date').agg({
    'status': lambda x: (x == 'SUCCESS').sum() / len(x) * 100,
    'id': 'count'
}).rename(columns={'status': 'success_rate', 'id': 'pilot_count'})

if len(daily_pilot) > 0:
    dates = [str(d) for d in daily_pilot.index]
    x_pos = np.arange(len(dates))
    ax.fill_between(x_pos, daily_pilot['success_rate'].values, alpha=0.4, color=ieee_colors[3])
    ax.plot(x_pos, daily_pilot['success_rate'].values, marker='s', linewidth=1.5, 
            markersize=6, color=ieee_colors[3], label='Test Pilot Success Rate')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(dates, rotation=45, ha='right')
    ax.set_ylim([0, 105])
else:
    ax.text(0.5, 0.5, 'No pilot data available', ha='center', va='center', 
            transform=ax.transAxes, fontsize=11)

ax.set_xlabel('Date', fontsize=11, fontweight='bold')
ax.set_ylabel('Success Rate (%)', fontsize=11, fontweight='bold')
ax.grid(True, alpha=0.3, linestyle=':', linewidth=0.5)
ax.set_axisbelow(True)

fig.text(0.5, -0.12, 'Fig. 3. Test Pilot Data Performance', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.08, 1, 1])
plt.savefig(os.path.join(output_dir, '3_test_pilot_performance.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 3 - Test Pilot Performance")

# ============================================================================
# Graph 4: TIME SAVING ANALYSIS
# ============================================================================
fig, ax = plt.subplots(figsize=(8, 5))

# Analyze verification methods (faster methods = time saving)
method_efficiency = df.groupby('verification_method').agg({
    'status': lambda x: (x == 'SUCCESS').sum() / len(x) * 100,
    'id': 'count'
}).rename(columns={'status': 'success_rate', 'id': 'count'})

# Sort by success rate
method_efficiency = method_efficiency.sort_values('success_rate', ascending=True)

colors_bar = ieee_colors[:len(method_efficiency)]
bars = ax.barh(range(len(method_efficiency)), method_efficiency['success_rate'], 
               color=colors_bar, alpha=0.8, height=0.6)
ax.set_yticks(range(len(method_efficiency)))
ax.set_yticklabels(method_efficiency.index, fontsize=10)
ax.set_xlabel('Success Rate (%)', fontsize=11, fontweight='bold')
ax.set_xlim([0, 105])
ax.grid(True, alpha=0.3, axis='x', linestyle=':', linewidth=0.5)
ax.set_axisbelow(True)

# Add value labels on bars
for i, (idx, row) in enumerate(method_efficiency.iterrows()):
    ax.text(row['success_rate'] + 1.5, i, f"{row['success_rate']:.1f}%", va='center', fontsize=8)

fig.text(0.5, -0.12, 'Fig. 4. Time Saving by Verification Method', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.08, 1, 1])
plt.savefig(os.path.join(output_dir, '4_time_saving_analysis.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 4 - Time Saving Analysis")

# ============================================================================
# Graph 5: VERIFICATION METHOD COMPARISON
# ============================================================================
fig, ax = plt.subplots(figsize=(8, 6))

method_counts = df['verification_method'].value_counts()
colors_pie = ieee_colors[:len(method_counts)]
wedges, texts, autotexts = ax.pie(method_counts.values, labels=method_counts.index, autopct='%1.1f%%',
                                    colors=colors_pie, startangle=90, textprops={'fontsize': 10})

for autotext in autotexts:
    autotext.set_color('white')
    autotext.set_fontweight('bold')
    autotext.set_fontsize(9)

for text in texts:
    text.set_fontsize(10)
    text.set_fontweight('bold')

ax.set_aspect('equal')
fig.text(0.5, -0.02, 'Fig. 5. Verification Method Distribution', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.03, 1, 1])
plt.savefig(os.path.join(output_dir, '5_verification_methods.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 5 - Verification Methods")

# ============================================================================
# Graph 6: BIOMETRIC CONFIDENCE ANALYSIS
# ============================================================================
fig, ax = plt.subplots(figsize=(10, 5))

# Calculate average confidence scores by date
daily_biometric = df.groupby('date').agg({
    'face_similarity_score': 'mean',
    'biometric_confidence': 'mean',
    'liveness_score': 'mean',
    'ocr_confidence': 'mean'
})

dates = [str(d) for d in daily_biometric.index]
x_pos = np.arange(len(dates))

ax.plot(x_pos, daily_biometric['face_similarity_score'] * 100, marker='o', label='Face Similarity', 
        linewidth=1.5, markersize=5, color=ieee_colors[0])
ax.plot(x_pos, daily_biometric['biometric_confidence'] * 100, marker='s', label='Biometric Confidence', 
        linewidth=1.5, markersize=5, color=ieee_colors[1])
ax.plot(x_pos, daily_biometric['liveness_score'] * 100, marker='^', label='Liveness Score', 
        linewidth=1.5, markersize=5, color=ieee_colors[2])
ax.plot(x_pos, daily_biometric['ocr_confidence'] * 100, marker='d', label='OCR Confidence', 
        linewidth=1.5, markersize=5, color=ieee_colors[3])

ax.set_xlabel('Date', fontsize=11, fontweight='bold')
ax.set_ylabel('Confidence Score (%)', fontsize=11, fontweight='bold')
ax.set_xticks(x_pos)
ax.set_xticklabels(dates, rotation=45, ha='right')
ax.set_ylim([0, 105])
ax.legend(loc='best', fontsize=9, framealpha=0.9, edgecolor='black', fancybox=False)
ax.grid(True, alpha=0.3, linestyle=':', linewidth=0.5)
ax.set_axisbelow(True)

fig.text(0.5, -0.15, 'Fig. 6. Biometric Confidence Metrics Over Time', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.1, 1, 1])
plt.savefig(os.path.join(output_dir, '6_biometric_confidence.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 6 - Biometric Confidence")

# ============================================================================
# Graph 7: TRANSACTION VOLUME & SUCCESS RATE
# ============================================================================
fig, ax1 = plt.subplots(figsize=(10, 5))

daily_volume = df.groupby('date').agg({
    'id': 'count',
    'status': lambda x: (x == 'SUCCESS').sum() / len(x) * 100
}).rename(columns={'id': 'volume', 'status': 'success_rate'})

dates = [str(d) for d in daily_volume.index]
x_pos = np.arange(len(dates))

color1 = ieee_colors[0]
bars = ax1.bar(x_pos, daily_volume['volume'], color=color1, alpha=0.7, width=0.5, label='Transaction Volume')
ax1.set_xlabel('Date', fontsize=11, fontweight='bold')
ax1.set_ylabel('Transaction Count', fontsize=11, fontweight='bold', color=color1)
ax1.tick_params(axis='y', labelcolor=color1)
ax1.set_xticks(x_pos)
ax1.set_xticklabels(dates, rotation=45, ha='right')
ax1.grid(True, alpha=0.3, axis='y', linestyle=':', linewidth=0.5)
ax1.set_axisbelow(True)

ax2 = ax1.twinx()
color2 = ieee_colors[1]
line = ax2.plot(x_pos, daily_volume['success_rate'], color=color2, marker='o', linewidth=1.5, 
                markersize=6, label='Success Rate', zorder=3)
ax2.set_ylabel('Success Rate (%)', fontsize=11, fontweight='bold', color=color2)
ax2.tick_params(axis='y', labelcolor=color2)
ax2.set_ylim([0, 105])

# Add legend
lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left', fontsize=9, framealpha=0.9, edgecolor='black', fancybox=False)

fig.text(0.5, -0.15, 'Fig. 7. Daily Transaction Volume and Success Rate', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.1, 1, 1])
plt.savefig(os.path.join(output_dir, '7_volume_success_rate.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 7 - Volume & Success Rate")

# ============================================================================
# Graph 8: ELIGIBILITY REASON DISTRIBUTION
# ============================================================================
fig, ax = plt.subplots(figsize=(10, 6))

eligibility_counts = df['eligibility_reason'].value_counts().head(10)
colors_bar = ieee_colors[:len(eligibility_counts)] + ieee_colors * (len(eligibility_counts) // len(ieee_colors) + 1)
colors_bar = colors_bar[:len(eligibility_counts)]

bars = ax.barh(range(len(eligibility_counts)), eligibility_counts.values, color=colors_bar, alpha=0.8, height=0.6)
ax.set_yticks(range(len(eligibility_counts)))
ax.set_yticklabels(eligibility_counts.index, fontsize=9)
ax.set_xlabel('Number of Records', fontsize=11, fontweight='bold')
ax.invert_yaxis()
ax.grid(True, alpha=0.3, axis='x', linestyle=':', linewidth=0.5)
ax.set_axisbelow(True)

# Add value labels
for i, (idx, val) in enumerate(eligibility_counts.items()):
    ax.text(val + 0.1, i, str(val), va='center', fontsize=8)

fig.text(0.5, -0.08, 'Fig. 8. Top 10 Eligibility Reasons', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.06, 1, 1])
plt.savefig(os.path.join(output_dir, '8_eligibility_distribution.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 8 - Eligibility Distribution")

# ============================================================================
# Graph 9: DISTANCE vs TRANSACTION SUCCESS
# ============================================================================
fig, ax = plt.subplots(figsize=(8, 5))

# Parse distance values
df['distance_km'] = df['distance'].str.extract(r'(\d+\.?\d*)').astype(float)
df_with_distance = df.dropna(subset=['distance_km'])

if len(df_with_distance) > 0:
    success_by_distance = df_with_distance.groupby(pd.cut(df_with_distance['distance_km'], bins=5)).agg({
        'status': lambda x: (x == 'SUCCESS').sum() / len(x) * 100,
        'id': 'count'
    }).rename(columns={'status': 'success_rate', 'id': 'count'})
    
    distance_labels = [f"{int(interval.left)}-{int(interval.right)} km" for interval in success_by_distance.index]
    
    bars = ax.bar(range(len(success_by_distance)), success_by_distance['success_rate'], 
                  color=ieee_colors[0], alpha=0.8, width=0.6)
    ax.set_xticks(range(len(success_by_distance)))
    ax.set_xticklabels(distance_labels, rotation=45, ha='right')
    ax.set_ylim([0, 105])
    
    # Add value labels
    for bar in bars:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height,
                f'{height:.1f}%', ha='center', va='bottom', fontsize=8)
else:
    ax.text(0.5, 0.5, 'No distance data available', ha='center', va='center', 
            transform=ax.transAxes, fontsize=11)

ax.set_xlabel('Distance Range', fontsize=11, fontweight='bold')
ax.set_ylabel('Success Rate (%)', fontsize=11, fontweight='bold')
ax.grid(True, alpha=0.3, axis='y', linestyle=':', linewidth=0.5)
ax.set_axisbelow(True)

fig.text(0.5, -0.15, 'Fig. 9. Transaction Success by Distance Range', ha='center', fontsize=10, style='italic')
plt.tight_layout(rect=[0, 0.1, 1, 1])
plt.savefig(os.path.join(output_dir, '9_distance_success.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 9 - Distance vs Success")

# ============================================================================
# Graph 10: ALL METRICS COMBINED DASHBOARD
# ============================================================================
fig = plt.figure(figsize=(16, 11))
fig.suptitle('APSRTC Ticket Portal - Comprehensive Analytics Dashboard', fontsize=13, fontweight='bold', y=0.98)

gs = fig.add_gridspec(3, 3, hspace=0.35, wspace=0.3)

# Efficiency
ax1 = fig.add_subplot(gs[0, :2])
dates = [str(d) for d in daily_stats.index]
x_pos = np.arange(len(dates))
ax1.plot(x_pos, daily_stats['efficiency'], marker='o', linewidth=1.5, markersize=5, color=ieee_colors[0])
ax1.fill_between(x_pos, daily_stats['efficiency'], alpha=0.2, color=ieee_colors[0])
ax1.set_xticks(x_pos)
ax1.set_xticklabels(dates, rotation=45, fontsize=8)
ax1.set_ylabel('Efficiency (%)', fontsize=9, fontweight='bold')
ax1.set_title('(a) System Efficiency', fontsize=10, fontweight='bold')
ax1.grid(True, alpha=0.3, linestyle=':', linewidth=0.5)
ax1.set_ylim([0, 105])
ax1.set_axisbelow(True)

# Cost Effectiveness
ax2 = fig.add_subplot(gs[0, 2])
x_pos_cost = np.arange(len(daily_cost))
ax2.bar(x_pos_cost, daily_cost['cost_effectiveness'], color=ieee_colors[1], alpha=0.8, width=0.6)
ax2.set_xticks(x_pos_cost)
ax2.set_xticklabels([str(d)[:10] for d in daily_cost.index], rotation=45, fontsize=8)
ax2.set_ylabel('Cost Effectiveness (%)', fontsize=9, fontweight='bold')
ax2.set_title('(b) Cost Effectiveness', fontsize=10, fontweight='bold')
ax2.set_ylim([0, 105])
ax2.grid(True, alpha=0.3, axis='y', linestyle=':', linewidth=0.5)
ax2.set_axisbelow(True)

# Success Rate
ax3 = fig.add_subplot(gs[1, 0])
ax3.plot(x_pos, daily_stats['efficiency'], marker='o', color=ieee_colors[2], linewidth=1.5, markersize=5)
ax3.set_xticks(x_pos)
ax3.set_xticklabels(dates, rotation=45, fontsize=8)
ax3.set_ylabel('Success Rate (%)', fontsize=9, fontweight='bold')
ax3.set_title('(c) Success Rate', fontsize=10, fontweight='bold')
ax3.grid(True, alpha=0.3, linestyle=':', linewidth=0.5)
ax3.set_ylim([0, 105])
ax3.set_axisbelow(True)

# Method Distribution
ax4 = fig.add_subplot(gs[1, 1])
method_counts.plot(kind='bar', ax=ax4, color=ieee_colors[:len(method_counts)], alpha=0.8, width=0.7)
ax4.set_ylabel('Count', fontsize=9, fontweight='bold')
ax4.set_title('(d) Verification Methods', fontsize=10, fontweight='bold')
ax4.set_xlabel('')
ax4.tick_params(axis='x', rotation=45, labelsize=8)
ax4.grid(True, alpha=0.3, axis='y', linestyle=':', linewidth=0.5)
ax4.set_axisbelow(True)

# Eligibility Top 5
ax5 = fig.add_subplot(gs[1, 2])
eligibility_counts.head(5).plot(kind='barh', ax=ax5, color=ieee_colors[:5], alpha=0.8, width=0.7)
ax5.set_xlabel('Count', fontsize=9, fontweight='bold')
ax5.set_title('(e) Top 5 Eligibility', fontsize=10, fontweight='bold')
ax5.set_ylabel('')
ax5.tick_params(axis='y', labelsize=8)
ax5.grid(True, alpha=0.3, axis='x', linestyle=':', linewidth=0.5)
ax5.set_axisbelow(True)

# Transaction Volume
ax6 = fig.add_subplot(gs[2, :])
dates_vol = [str(d) for d in daily_volume.index]
x_pos_vol = np.arange(len(dates_vol))
ax6.bar(x_pos_vol, daily_volume['volume'], color=ieee_colors[3], alpha=0.7, width=0.5, label='Volume')
ax6_twin = ax6.twinx()
ax6_twin.plot(x_pos_vol, daily_volume['success_rate'], marker='o', color=ieee_colors[0], 
             linewidth=1.5, markersize=5, label='Success %', zorder=3)
ax6.set_xlabel('Date', fontsize=9, fontweight='bold')
ax6.set_ylabel('Transaction Volume', fontsize=9, fontweight='bold', color=ieee_colors[3])
ax6_twin.set_ylabel('Success Rate (%)', fontsize=9, fontweight='bold', color=ieee_colors[0])
ax6.set_title('(f) Volume & Success Trend', fontsize=10, fontweight='bold')
ax6.set_xticks(x_pos_vol)
ax6.set_xticklabels(dates_vol, rotation=45, fontsize=8)
ax6_twin.set_ylim([0, 105])
ax6.tick_params(axis='y', labelcolor=ieee_colors[3])
ax6_twin.tick_params(axis='y', labelcolor=ieee_colors[0])
ax6.grid(True, alpha=0.3, axis='y', linestyle=':', linewidth=0.5)
ax6.set_axisbelow(True)

# Combined legend
lines1, labels1 = ax6.get_legend_handles_labels()
lines2, labels2 = ax6_twin.get_legend_handles_labels()
ax6.legend(lines1 + lines2, labels1 + labels2, loc='upper left', fontsize=8, framealpha=0.9, edgecolor='black', fancybox=False)

fig.text(0.5, 0.01, 'Fig. 10. Comprehensive Analytics Dashboard - (a) System Efficiency, (b) Cost Effectiveness, (c) Success Rate, (d) Verification Methods, (e) Top Eligibility Reasons, (f) Volume and Success Trend', 
         ha='center', fontsize=9, style='italic', wrap=True)

plt.savefig(os.path.join(output_dir, '10_combined_dashboard.png'), dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Generated: Fig. 10 - Combined Dashboard")

# ============================================================================
# Print Summary Statistics
# ============================================================================
print("\n" + "="*70)
print("APSRTC TICKET PORTAL - ANALYTICS REPORT")
print("="*70)
print(f"Total Records Analyzed: {len(df)}")
print(f"System Success Rate: {(df['status'] == 'SUCCESS').sum() / len(df) * 100:.2f}%")
print(f"Total Savings Amount: ${df['savings_amount'].sum():.2f}")
print(f"Total Paid Amount: ${df['paid_amount'].sum():.2f}")
print(f"Average Journey Distance: {df_with_distance['distance_km'].mean():.2f} km" if len(df_with_distance) > 0 else "Average Distance: N/A")
print(f"\nGraphs Output Directory: {output_dir}")
print("="*70)
print("\nGenerated IEEE-Compliant Figures:")
print("  Fig. 1  - System Efficiency Over Time")
print("  Fig. 2  - Cost Effectiveness Analysis")
print("  Fig. 3  - Test Pilot Data Performance")
print("  Fig. 4  - Time Saving by Verification Method")
print("  Fig. 5  - Verification Method Distribution")
print("  Fig. 6  - Biometric Confidence Metrics Over Time")
print("  Fig. 7  - Daily Transaction Volume and Success Rate")
print("  Fig. 8  - Top 10 Eligibility Reasons")
print("  Fig. 9  - Transaction Success by Distance Range")
print("  Fig. 10 - Comprehensive Analytics Dashboard")
print("="*70)
print("\nAll figures are formatted according to IEEE standards:")
print("  • Resolution: 300 DPI (publication-ready)")
print("  • Format: PNG with white background")
print("  • Font: Arial/Helvetica (standard)")
print("  • Font size: 9-11 pt (IEEE compliant)")
print("  • Figure captions: Included below each figure")
print("  • Color scheme: Professional IEEE palette")
print("="*70 + "\n")
