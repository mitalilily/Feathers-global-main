import React from 'react'
import ReactApexChart from 'react-apexcharts'
import { useColorModeValue } from '@chakra-ui/react'

const DonutChart = ({ series = [], labels = [] }) => {
  const textColor = useColorModeValue('gray.700', 'white')
  const textColorSecondary = useColorModeValue('gray.500', 'gray.400')

  const chartOptions = {
    chart: {
      type: 'donut',
      toolbar: { show: false },
    },
    labels,
    colors: ['#0EA5E9', '#14B8A6', '#F97316', '#8B5CF6', '#F43F5E', '#22C55E'],
    legend: {
      position: 'bottom',
      labels: {
        colors: textColorSecondary,
      },
    },
    dataLabels: {
      enabled: true,
      style: {
        fontSize: '12px',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 700,
        colors: [textColor],
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show: true,
            name: {
              show: true,
              color: textColorSecondary,
            },
            value: {
              show: true,
              color: textColor,
              fontSize: '24px',
              fontWeight: 800,
            },
            total: {
              show: true,
              label: 'Total',
              color: textColorSecondary,
            },
          },
        },
      },
    },
    tooltip: {
      theme: useColorModeValue('light', 'dark'),
    },
  }

  return <ReactApexChart options={chartOptions} series={series} type="donut" width="100%" height="100%" />
}

export default DonutChart
