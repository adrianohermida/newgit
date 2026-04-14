import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronRight, Zap, BookOpen, Users } from 'lucide-react';

export default function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      number: 1,
      title: '👋 Bem-vindo ao Legal Tasks',
      description: 'Gerencie publicações judiciais com inteligência',
      action: 'Começar',
      duration: '2 min'
    },
    {
      number: 2,
      title: '⚙️ Configure Integrações',
      description: 'Conecte com Advise, Freshdesk e outras plataformas',
      action: 'Conectar APIs',
      duration: '3 min'
    },
    {
      number: 3,
      title: '📚 Explore Funcionalidades',
      description: 'Veja publicações, intimações, processos',
      action: 'Ver Exemplo',
      duration: '4 min'
    },
    {
      number: 4,
      title: '🎯 Crie Seu Primeiro Alerta',
      description: 'Configure notificações para seus casos críticos',
      action: 'Criar Alerta',
      duration: '2 min'
    },
    {
      number: 5,
      title: '✅ Tudo Pronto!',
      description: 'Você está pronto para usar o Legal Tasks',
      action: 'Ir para Dashboard',
      duration: 'Concluído'
    }
  ];

  const step = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSkip = () => {
    setCurrentStep(steps.length - 1);
  };

  return (
    <div className="space-y-6 p-6 min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Progress Bar */}
      <div className="flex gap-2 justify-center">
        {steps.map((_, idx) => (
          <div
            key={idx}
            className={`h-2 flex-1 rounded-full transition-all ${
              idx <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Main Card */}
      <Card className="max-w-2xl mx-auto p-8 text-center">
        <div className="mb-6">
          <div className="text-6xl mb-4">
            {step.number === 1 && '👋'}
            {step.number === 2 && '⚙️'}
            {step.number === 3 && '📚'}
            {step.number === 4 && '🎯'}
            {step.number === 5 && '✅'}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{step.title}</h1>
          <p className="text-gray-600">{step.description}</p>
        </div>

        {/* Context Help */}
        {currentStep === 0 && (
          <div className="my-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              💡 Legal Tasks ajuda você a gerenciar publicações judiciais, intimações e processos em um único lugar. Sincronize com suas ferramentas favoritas e receba notificações inteligentes.
            </p>
          </div>
        )}

        {currentStep === 1 && (
          <div className="my-8 space-y-3">
            <div className="p-4 bg-gray-50 rounded-lg text-left">
              <p className="font-medium text-gray-900 mb-2">Conectar com Advise</p>
              <p className="text-xs text-gray-600">Sincronize publicações e intimações automaticamente</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-left">
              <p className="font-medium text-gray-900 mb-2">Conectar com Google Calendar</p>
              <p className="text-xs text-gray-600">Prazos aparecem automaticamente no seu calendário</p>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="my-8 grid grid-cols-2 gap-4">
            <Card className="p-4 border-2 border-blue-600 bg-blue-50">
              <Users className="w-8 h-8 mx-auto text-blue-600 mb-2" />
              <p className="font-medium text-gray-900">Publicações</p>
              <p className="text-xs text-gray-600 mt-1">1,234 sincronizadas</p>
            </Card>
            <Card className="p-4 border-2 border-green-600 bg-green-50">
              <Zap className="w-8 h-8 mx-auto text-green-600 mb-2" />
              <p className="font-medium text-gray-900">Intimações</p>
              <p className="text-xs text-gray-600 mt-1">45 pendentes</p>
            </Card>
          </div>
        )}

        {currentStep === 3 && (
          <div className="my-8 p-6 bg-yellow-50 rounded-lg border border-yellow-200">
            <BookOpen className="w-12 h-12 mx-auto text-yellow-600 mb-3" />
            <p className="text-sm text-yellow-800">
              📢 Configure alertas para não perder nenhum prazo importante. Escolha notificações por email, push ou in-app.
            </p>
          </div>
        )}

        {currentStep === 4 && (
          <div className="my-8 space-y-3">
            <div className="flex items-center gap-2 justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <span className="text-gray-900 font-medium">Perfil criado</span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <span className="text-gray-900 font-medium">Integrações configuradas</span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <span className="text-gray-900 font-medium">Primeiro alerta criado</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 flex gap-3 justify-center">
          {currentStep > 0 && (
            <Button
              onClick={() => setCurrentStep(currentStep - 1)}
              variant="outline"
            >
              Voltar
            </Button>
          )}

          {currentStep < steps.length - 1 && (
            <>
              <Button
                onClick={handleSkip}
                variant="outline"
              >
                Pular
              </Button>
              <Button
                onClick={handleNext}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {step.action}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}

          {currentStep === steps.length - 1 && (
            <Button className="bg-green-600 hover:bg-green-700">
              {step.action}
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>

        {/* Step Info */}
        <p className="text-xs text-gray-500 mt-6">
          Passo {currentStep + 1} de {steps.length} • {step.duration}
        </p>
      </Card>
    </div>
  );
}